// ============================================================
//  TowerForge Link — Android phones over Wi-Fi
//  Android 11+ has Wireless debugging (Settings → Developer options).
//  The player pairs once: on the phone, "Pair device with pairing
//  code" shows an address and a 6-digit code, typed on towerforge.net
//  and handed to `adb pair`. adb keeps the pairing (its key stays on
//  this PC and in the phone's list of paired computers). After that,
//  while wireless debugging is on and the phone is on the same Wi-Fi,
//  adb finds it by itself (mDNS, "_adb-tls-connect._tcp") and Link
//  connects to it before looking for the export — the same file, read
//  the same way as from an emulator, so Auto import works from a
//  phone. Wireless debugging switches itself off when the phone
//  restarts or leaves the Wi-Fi; switching it back on is enough.
//  Remembered in %LOCALAPPDATA%\TowerForgeLink\phones.txt: each phone
//  paired through Link and the last address it answered on (never the
//  code). Needs Google's adb (PlatformTools).
//  Only addresses on a home network are accepted (10.x, 172.16–31.x,
//  192.168.x, 169.254.x), so Link can't be pointed anywhere else.
// ============================================================

using System.Text.RegularExpressions;

namespace TowerForge.Link;

internal sealed record PhoneRecord(string Name, string LastAddress);

internal static partial class Phones
{
    private static readonly string File_ = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TowerForgeLink", "phones.txt");
    private static readonly TimeSpan Quick = TimeSpan.FromSeconds(8);
    private static readonly TimeSpan PairTime = TimeSpan.FromSeconds(20);

    [GeneratedRegex(@"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$")]
    private static partial Regex AddressPattern();

    [GeneratedRegex(@"^\d{6}$")]
    private static partial Regex CodePattern();

    [GeneratedRegex(@"guid=([A-Za-z0-9._-]+)")]
    private static partial Regex GuidPattern();

    // ── The list of paired phones ────────────────────────────────
    public static List<PhoneRecord> Paired()
    {
        try
        {
            if (!File.Exists(File_)) return [];
            return File.ReadAllLines(File_)
                .Select(l => l.Split('\t'))
                .Where(p => p.Length == 2 && p[0].Length > 0)
                .Select(p => new PhoneRecord(p[0], p[1]))
                .ToList();
        }
        catch (IOException) { return []; }
    }

    public static bool Any() => Paired().Count > 0;

    private static void Save(List<PhoneRecord> phones)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(File_)!);
        File.WriteAllLines(File_, phones.Select(p => $"{p.Name}\t{p.LastAddress}"));
    }

    private static void Remember(string name, string address)
    {
        var phones = Paired().Where(p => p.Name != name).ToList();
        phones.Add(new PhoneRecord(name, address));
        Save(phones);
    }

    // ── Checking what the player typed ───────────────────────────
    // "192.168.1.23:37415" on a home network, or null.
    public static string? CleanAddress(string? raw)
    {
        var m = AddressPattern().Match((raw ?? "").Trim());
        if (!m.Success) return null;
        var b = Enumerable.Range(1, 4).Select(i => int.Parse(m.Groups[i].Value)).ToArray();
        var port = int.Parse(m.Groups[5].Value);
        if (b.Any(x => x > 255) || port is < 1 or > 65535) return null;
        var home = b[0] == 10 || (b[0] == 172 && b[1] is >= 16 and <= 31) || (b[0] == 192 && b[1] == 168)
            || (b[0] == 169 && b[1] == 254);
        return home ? $"{b[0]}.{b[1]}.{b[2]}.{b[3]}:{port}" : null;
    }

    public static bool IsCode(string? raw) => CodePattern().IsMatch((raw ?? "").Trim());

    // ── Pairing and connecting ───────────────────────────────────
    public static async Task<string> PairAsync(Adb adb, string address, string code, Action<string> log)
    {
        await adb.StartServerAsync();
        var r = await adb.RunAsync(PairTime, "pair", address, code.Trim());
        var text = (r.Out + "\n" + r.Err).Trim();
        if (r.TimedOut || !text.Contains("Successfully paired", StringComparison.OrdinalIgnoreCase))
        {
            log($"Pairing with {address} didn't work: {FirstLine(text)}");
            throw new ExportProblem("pair_failed", text.Contains("Wrong password", StringComparison.OrdinalIgnoreCase)
                ? "The phone said the code was wrong. On the phone, tap \"Pair device with pairing code\" again and type the new code."
                : "Couldn't reach the phone to pair. Check that the phone and this PC are on the same Wi-Fi, that the "
                  + "pairing screen is still open on the phone, and that you typed its address and port exactly — then try again.");
        }
        var guid = GuidPattern().Match(text);
        var name = guid.Success ? guid.Groups[1].Value : address;
        // The pairing address only pairs; the phone's own one (Wireless
        // debugging's main screen) connects. adb finds that by itself.
        Remember(name, "");
        log($"Paired with your phone ({address}).");
        var connected = await ConnectAsync(adb, log, TimeSpan.FromSeconds(12));
        return connected.Count > 0
            ? "Paired and connected. From now on Get from emulator or phone and Auto import read your phone while Wireless debugging is on."
            : "Paired. If it doesn't connect within a minute, type the IP address & port shown at the top of the phone's "
              + "Wireless debugging screen (not the pairing one) under \"Connect\".";
    }

    // Connects to an address the player typed (Wireless debugging's main screen).
    public static async Task<string> ConnectAddressAsync(Adb adb, string address, Action<string> log)
    {
        await adb.StartServerAsync();
        var r = await adb.RunAsync(Quick, "connect", address);
        if (!Connected(r.Out))
        {
            throw new ExportProblem("connect_failed",
                "Couldn't connect to the phone. Pair it first, keep Wireless debugging on, and type the IP address & port "
                + "from the top of its Wireless debugging screen.");
        }
        var phones = Paired();
        var name = phones.Count == 1 ? phones[0].Name : address;
        Remember(name, address);
        log($"Connected to your phone ({address}).");
        return "Connected. Get from emulator or phone and Auto import now read your phone while Wireless debugging is on.";
    }

    // Connects to every paired phone adb can see on the network (and the
    // last addresses that worked). Waits up to `wait` for mDNS to find one.
    public static async Task<List<string>> ConnectAsync(Adb adb, Action<string>? log = null, TimeSpan? wait = null)
    {
        var connected = new List<string>();
        var until = DateTime.UtcNow + (wait ?? TimeSpan.Zero);
        do
        {
            var addresses = new List<string>();
            var services = await adb.RunAsync(Quick, "mdns", "services");
            foreach (var line in services.Out.Split('\n'))
            {
                var parts = line.Split(['\t', ' '], StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 3 && parts[1].StartsWith("_adb-tls-connect", StringComparison.Ordinal)
                    && CleanAddress(parts[2]) is string a) addresses.Add(a);
            }
            addresses.AddRange(Paired().Select(p => p.LastAddress).Where(a => CleanAddress(a) != null));
            foreach (var address in addresses.Distinct())
            {
                var r = await adb.RunAsync(Quick, "connect", address);
                if (Connected(r.Out) && !connected.Contains(address))
                {
                    connected.Add(address);
                    log?.Invoke($"Connected to your phone ({address}).");
                }
            }
            if (connected.Count > 0 || DateTime.UtcNow >= until) break;
            await Task.Delay(1500);
        } while (true);
        return connected;
    }

    // Forgets the phones paired through Link (the phone keeps its own list).
    public static async Task ForgetAsync(Adb? adb)
    {
        if (adb != null) await adb.RunAsync(Quick, "disconnect");
        try { if (File.Exists(File_)) File.Delete(File_); } catch (IOException) { /* best effort */ }
    }

    // Serials adb lists that aren't emulators on this PC.
    public static bool IsPhoneSerial(string serial) =>
        !serial.StartsWith("emulator-", StringComparison.Ordinal)
        && !serial.StartsWith("127.0.0.1:", StringComparison.Ordinal)
        && !serial.StartsWith("localhost:", StringComparison.Ordinal);

    private static bool Connected(string output) =>
        output.Contains("connected to", StringComparison.OrdinalIgnoreCase)
        && !output.Contains("failed", StringComparison.OrdinalIgnoreCase)
        && !output.Contains("cannot", StringComparison.OrdinalIgnoreCase);

    private static string FirstLine(string s) => s.Split('\n').FirstOrDefault()?.Trim() ?? "";
}
