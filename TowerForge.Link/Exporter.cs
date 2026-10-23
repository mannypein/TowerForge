// ============================================================
//  TowerForge Link — reading the export
//  The game writes tool_export.json to its own folder,
//  /sdcard/Android/data/com.TechTreeGames.TheTower/files/ (Unity's
//  persistentDataPath; TheTowerSDK save/access/path). Phones on
//  Android 11+ hide that folder from other apps and the browser, but
//  adb can read it. Steps:
//   1. Pick an adb: with a phone paired over Wi-Fi, Google's (only it
//      can reach phones that way — Phones.cs); else the running
//      emulator's own (no version clash with the adb it runs itself),
//      else Android's platform-tools.
//   2. Connect to each running emulator's adb port, and to paired
//      phones adb can see on the Wi-Fi.
//   3. For every device adb lists, look for the file with `adb ls`
//      (the file-transfer channel: size and modified time, no shell).
//   4. Copy the newest one out with `adb pull` into a temp file, read
//      it, delete it.
//  iPhones (IPhoneBackups.cs): the export is read out of the newest
//  iPhone backup on this PC instead; the newest export of the two wins.
//  Nothing else on the device or in the backup is read or changed.
// ============================================================

using System.Globalization;

namespace TowerForge.Link;

internal sealed record ExportFile(byte[] Data, long ModifiedUnix, string Source, string Serial);

// What went wrong, in words for the player; Code is for the website.
internal sealed class ExportProblem(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

internal static class Exporter
{
    public const string Package = "com.TechTreeGames.TheTower";
    private const string Folder = "/sdcard/Android/data/" + Package + "/files/";
    private const string FileName = "tool_export.json";
    private static readonly TimeSpan Quick = TimeSpan.FromSeconds(8);
    private static readonly TimeSpan Copy = TimeSpan.FromSeconds(60);

    private sealed record Found(string Serial, long Size, long Modified);

    // The newest export; with newerThan (unix seconds), an empty one (no
    // Data) when the file isn't newer than that — nothing is copied.
    public static async Task<ExportFile> ReadAsync(long? newerThan = null)
    {
        var backup = IPhoneBackups.NewestWithExport();
        ExportFile? fromAdb = null;
        ExportProblem? adbProblem = null;
        try { fromAdb = await ReadFromAdbAsync(newerThan); }
        catch (ExportProblem p) { adbProblem = p; }

        if (fromAdb != null && (backup == null || fromAdb.ModifiedUnix >= backup.ExportModified)) return fromAdb;
        if (backup != null) return ReadBackup(backup, newerThan);
        // No export anywhere: say what's wrong with the iPhone backups when
        // there are some and nothing else was found.
        if (adbProblem?.Code == "no_emulator")
        {
            var backups = IPhoneBackups.Find();
            if (backups.Count > 0)
            {
                throw backups.All(b => b.Encrypted)
                    ? new ExportProblem("iphone_encrypted",
                        "Your iPhone backup is encrypted, and TowerForge Link can't read encrypted backups yet. In the Apple "
                        + "Devices app (or iTunes), untick \"Encrypt local backup\" and back up again — or use Import Game Data.")
                    : new ExportProblem("iphone_no_export",
                        "Your newest iPhone backup doesn't have the game's data export. In The Tower, export your data "
                        + "(Settings → External Tools Export), then back up your iPhone again and try again.");
            }
        }
        throw adbProblem ?? new ExportProblem("failed", "TowerForge Link couldn't find your export.");
    }

    private static ExportFile ReadBackup(IPhoneBackup backup, long? newerThan)
    {
        var source = IPhoneBackups.Describe(backup);
        if (newerThan is long seen && backup.ExportModified <= seen) return new ExportFile([], backup.ExportModified, source, "iphone-backup");
        byte[] data;
        try { data = File.ReadAllBytes(backup.ExportPath!); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new ExportProblem("copy_failed", "Found the export in your iPhone backup but couldn't read it. Wait for the backup to finish, then try again.");
        }
        if (!LooksLikeJson(data))
        {
            throw new ExportProblem("bad_file", "The export in your iPhone backup doesn't look right. Export your data again in the game, back up again, then try again.");
        }
        return new ExportFile(data, backup.ExportModified, source, "iphone-backup");
    }

    // Emulators and Android phones, through adb.
    private static async Task<ExportFile> ReadFromAdbAsync(long? newerThan)
    {
        var emulators = Emulators.Find();
        var phoneAdb = Phones.Any() ? await PlatformTools.FindAsync() : null;
        if (emulators.Count == 0 && phoneAdb == null)
        {
            throw new ExportProblem("no_emulator",
                "No Android emulator found on this PC. TowerForge Link works with BlueStacks (and MuMu, LDPlayer, "
                + "MEmu or Nox), or an Android phone over Wi-Fi — pair it from \"Get from emulator or phone\" on towerforge.net.");
        }

        var running = emulators.Where(e => e.Running && e.Ports.Length > 0).ToList();
        var pick = running.FirstOrDefault()
            ?? emulators.FirstOrDefault(e => e.Name == "Android platform-tools")
            ?? emulators.FirstOrDefault();
        var adb = new Adb(phoneAdb?.Path ?? pick!.AdbPath);
        await adb.StartServerAsync();
        foreach (var e in running.Count > 0 ? running : emulators)
        {
            foreach (var port in e.Ports) await adb.RunAsync(Quick, "connect", $"127.0.0.1:{port}");
        }
        if (phoneAdb != null) await Phones.ConnectAsync(adb);

        var devices = await ListDevicesAsync(adb);
        if (devices.Count == 0)
        {
            if (phoneAdb != null && running.Count == 0)
            {
                throw new ExportProblem("phone_offline",
                    "Your phone isn't connected. On the phone, turn on Wireless debugging (Settings → Developer options), "
                    + "on the same Wi-Fi as this PC, then try again. No need to pair again.");
            }
            throw new ExportProblem("not_running", running.Count == 0
                ? "Your emulator isn't running. Start it (with The Tower installed), then try again."
                : $"{running[0].Name} is running but didn't answer. Wait for it to finish starting, then try again.");
        }
        if (devices.All(d => d.State == "unauthorized"))
        {
            throw new ExportProblem("unauthorized",
                "Your phone is asking whether to allow USB debugging. Tap Allow on the phone, then try again.");
        }

        var found = new List<Found>();
        var blocked = new List<string>();
        var noGame = new List<string>();
        var noExport = new List<string>();
        foreach (var (serial, state) in devices)
        {
            if (state != "device") continue;
            var listing = await adb.RunAsync(Quick, "-s", serial, "ls", Folder);
            var entries = ParseLs(listing.Out);
            var file = entries.FirstOrDefault(e => e.Name == FileName);
            if (file != null) { found.Add(new Found(serial, file.Size, file.Modified)); continue; }
            if (entries.Count > 0) { noExport.Add(serial); continue; }
            // No listing at all: is the folder missing, or is adb blocked?
            var sdcard = await adb.RunAsync(Quick, "-s", serial, "ls", "/sdcard/");
            if (ParseLs(sdcard.Out).Count == 0) blocked.Add(serial);
            else noGame.Add(serial);
        }

        if (found.Count == 0) throw Explain(emulators, blocked, noGame, noExport);

        // Two serials can name one emulator (emulator-5554 and 127.0.0.1:5555);
        // the newest export wins either way.
        var best = found.OrderByDescending(f => f.Modified).First();
        if (newerThan is long seen && best.Modified <= seen)
            return new ExportFile([], best.Modified, SourceName(best.Serial, emulators), best.Serial);
        var temp = Path.Combine(Path.GetTempPath(), "TowerForgeLink");
        Directory.CreateDirectory(temp);
        var local = Path.Combine(temp, $"{Guid.NewGuid():N}.json");
        try
        {
            var pull = await adb.RunAsync(Copy, "-s", best.Serial, "pull", Folder + FileName, local);
            if (!pull.Ok || !File.Exists(local))
            {
                throw new ExportProblem("copy_failed",
                    "Found your export but couldn't copy it. Try again; if it keeps failing, restart the emulator.");
            }
            var data = await File.ReadAllBytesAsync(local);
            if (!LooksLikeJson(data))
            {
                throw new ExportProblem("bad_file",
                    "The export file doesn't look right. Export your data again in the game, then try again.");
            }
            return new ExportFile(data, best.Modified, SourceName(best.Serial, emulators), best.Serial);
        }
        finally
        {
            try { File.Delete(local); } catch { /* temp folder; best effort */ }
        }
    }

    private static ExportProblem Explain(List<EmulatorInfo> emulators, List<string> blocked, List<string> noGame, List<string> noExport)
    {
        if (noExport.Count > 0)
        {
            return new ExportProblem("no_export",
                $"The Tower on {SourceName(noExport[0], emulators)} has no data export yet. "
                + "In the game, export your data, then try again.");
        }
        if (blocked.Count > 0)
        {
            var bs = emulators.FirstOrDefault(e => e.Name == "BlueStacks");
            if (bs != null && SourceName(blocked[0], emulators) == "BlueStacks")
            {
                return new ExportProblem("adb_off", bs.AdbEnabled == true
                    ? "BlueStacks has Android Debug Bridge turned on but hasn't applied it yet. Wait a minute, "
                      + "or close BlueStacks fully and open it again, then try again."
                    : "BlueStacks is blocking the connection. In BlueStacks open Settings → Advanced and turn on "
                      + "Android Debug Bridge (ADB), then close BlueStacks fully and open it again.");
            }
            return new ExportProblem("adb_off",
                "The emulator refused the connection. Turn on ADB (sometimes called \"local connection\" or "
                + "\"ADB debugging\") in its settings, restart it, then try again.");
        }
        return new ExportProblem("no_game",
            $"The Tower isn't installed on {SourceName(noGame.FirstOrDefault() ?? "", emulators)}, or hasn't been opened yet.");
    }

    private static async Task<List<(string Serial, string State)>> ListDevicesAsync(Adb adb)
    {
        var r = await adb.RunAsync(Quick, "devices");
        return r.Out.Split('\n')
            .Skip(1)
            .Select(l => l.Trim().Split('\t', ' '))
            .Where(p => p.Length >= 2 && p[0].Length > 0)
            .Select(p => (p[0], p[^1]))
            .ToList();
    }

    private sealed record LsEntry(string Name, long Size, long Modified);

    // `adb ls` prints "mode size mtime name", the numbers in hex.
    private static List<LsEntry> ParseLs(string output)
    {
        var entries = new List<LsEntry>();
        foreach (var line in output.Split('\n'))
        {
            var parts = line.Trim().Split(' ', 4, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 4) continue;
            if (!long.TryParse(parts[1], NumberStyles.HexNumber, null, out var size)) continue;
            if (!long.TryParse(parts[2], NumberStyles.HexNumber, null, out var mtime)) continue;
            entries.Add(new LsEntry(parts[3], size, mtime));   // includes "." and "..": the folder exists
        }
        return entries;
    }

    private static bool LooksLikeJson(byte[] data)
    {
        foreach (var b in data)
        {
            if (b is (byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n' or 0xEF or 0xBB or 0xBF) continue;
            return b == (byte)'{';
        }
        return false;
    }

    // Which emulator a serial belongs to: by its adb port (emulator-N listens on N + 1).
    private static string SourceName(string serial, List<EmulatorInfo> emulators)
    {
        if (Phones.IsPhoneSerial(serial)) return "your phone";
        int port = 0;
        if (serial.StartsWith("emulator-") && int.TryParse(serial["emulator-".Length..], out var console)) port = console + 1;
        else if (serial.Contains(':') && int.TryParse(serial[(serial.LastIndexOf(':') + 1)..], out var p)) port = p;
        var match = emulators.FirstOrDefault(e => e.Running && e.Ports.Contains(port))
            ?? emulators.FirstOrDefault(e => e.Ports.Contains(port));
        if (match != null) return match.Name;
        return port > 0 ? "your emulator" : "your phone";
    }
}
