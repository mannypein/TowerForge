// ============================================================
//  TowerForge Link — entry point
//  Starts the local link on 127.0.0.1:47821 and keeps a small
//  console window open with what it's doing. Close the window to
//  stop it. How it works: docs/towerforge-link.md.
// ============================================================

using System.Net;
using System.Net.Sockets;

namespace TowerForge.Link;

internal static class Program
{
    public const int Port = 47821;
    public static readonly string Version =
        typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "0.1.0";

    private static async Task<int> Main()
    {
        Console.Title = "TowerForge Link";
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.WriteLine($"TowerForge Link {Version}");
        Console.WriteLine("Gets The Tower's data export off your emulator for towerforge.net.");
        Console.WriteLine();

        var listener = new TcpListener(IPAddress.Loopback, Port);
        try
        {
            listener.Start();
        }
        catch (SocketException)
        {
            Console.WriteLine("TowerForge Link is already running (or something else uses port 47821).");
            Console.WriteLine("Press any key to close this window.");
            Console.ReadKey(true);
            return 1;
        }

        var emulators = Emulators.Find();
        if (emulators.Count == 0)
        {
            Console.WriteLine("No Android emulator found yet. Supported: BlueStacks, MuMu, LDPlayer, MEmu, Nox,");
            Console.WriteLine("or a phone on USB with Android's platform-tools installed.");
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
        Console.WriteLine("Ready. In the game, export your data; then on towerforge.net click \"Get from emulator\".");
        Console.WriteLine("Or turn on Auto export in the game (Settings > External Tools Export) and Auto import on the site.");
        Console.WriteLine("Leave this window open while you use it. Close it to stop.");
        Console.WriteLine();

        using var stop = new CancellationTokenSource();
        Console.CancelKeyPress += (_, ev) => { ev.Cancel = true; stop.Cancel(); };
        var server = new LinkServer(Port, msg => Console.WriteLine($"{DateTime.Now:HH:mm:ss}  {msg}"));
        await server.RunAsync(listener, stop.Token);
        listener.Stop();
        return 0;
    }
}
