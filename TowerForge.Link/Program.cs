// ============================================================
//  TowerForge Link — entry point
//  Starts the local link on 127.0.0.1:47821 and keeps a small
//  console window open with what it's doing. Close the window to
//  stop it. How it works: docs/towerforge-link.md.
//  --port N listens on another port (for testing beside a running copy;
//  the site only talks to 47821). --backups <folder> reads iPhone
//  backups from that folder instead (testing with a made-up backup).
// ============================================================

using System.Net;
using System.Net.Sockets;

namespace TowerForge.Link;

internal static class Program
{
    public const int Port = 47821;
    public static readonly string Version =
        typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "0.1.0";

    private static async Task<int> Main(string[] args)
    {
        var port = Port;
        var at = Array.IndexOf(args, "--port");
        if (at >= 0 && at + 1 < args.Length && int.TryParse(args[at + 1], out var p) && p is > 1024 and < 65536) port = p;
        var bk = Array.IndexOf(args, "--backups");
        if (bk >= 0 && bk + 1 < args.Length) IPhoneBackups.Override = args[bk + 1];

        Console.Title = "TowerForge Link";
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.WriteLine($"TowerForge Link {Version}");
        Console.WriteLine("Gets The Tower's data export off your emulator, Android phone or iPhone backup for towerforge.net.");
        Console.WriteLine();

        var listener = new TcpListener(IPAddress.Loopback, port);
        try
        {
            listener.Start();
        }
        catch (SocketException)
        {
            Console.WriteLine($"TowerForge Link is already running (or something else uses port {port}).");
            Console.WriteLine("Press any key to close this window.");
            Console.ReadKey(true);
            return 1;
        }

        var emulators = Emulators.Find();
        var phones = Phones.Paired();
        var iphones = IPhoneBackups.Find();
        if (emulators.Count == 0 && phones.Count == 0 && iphones.Count == 0)
        {
            Console.WriteLine("No Android emulator found yet. Supported: BlueStacks, MuMu, LDPlayer, MEmu, Nox,");
            Console.WriteLine("an Android phone over Wi-Fi, or an iPhone backed up to this PC: see \"Get from emulator or phone\" on towerforge.net.");
        }
        foreach (var b in iphones.Take(3))
        {
            var what = b.Encrypted ? "encrypted — Link can't read it yet"
                : b.ExportPath != null ? "has your export" : "no export in it yet";
            Console.WriteLine($"Found {IPhoneBackups.Describe(b)} ({what})");
        }
        if (phones.Count > 0)
        {
            Console.WriteLine($"Android phone{(phones.Count == 1 ? "" : "s")} paired: {phones.Count}. Turn on Wireless debugging on the phone to use it.");
        }
        foreach (var e in emulators)
        {
            var adb = e.AdbEnabled switch
            {
                true => " — Android Debug Bridge on",
                false => " — Android Debug Bridge OFF: turn it on in Settings → Advanced, then restart BlueStacks",
                null => "",
            };
            Console.WriteLine($"Found {e.Name}{(e.Running ? " (running)" : "")}{adb}");
        }
        Console.WriteLine();
        Console.WriteLine("Ready. In the game, export your data; then on towerforge.net click \"Get from emulator or phone\".");
        Console.WriteLine("Or turn on Auto export in the game (Settings > External Tools Export) and Auto import on the site.");
        Console.WriteLine("Leave this window open while you use it. Close it to stop.");
        Console.WriteLine();

        using var stop = new CancellationTokenSource();
        Console.CancelKeyPress += (_, ev) => { ev.Cancel = true; stop.Cancel(); };
        var server = new LinkServer(port, msg => Console.WriteLine($"{DateTime.Now:HH:mm:ss}  {msg}"));
        await server.RunAsync(listener, stop.Token);
        listener.Stop();
        return 0;
    }
}
