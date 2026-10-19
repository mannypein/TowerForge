// ============================================================
//  TowerForge Link — adb
//  Runs one adb executable (an emulator's own, or Android's
//  platform-tools) with a time limit and collects its output.
// ============================================================

using System.Diagnostics;

namespace TowerForge.Link;

internal sealed class Adb(string path)
{
    public string Path { get; } = path;

    public sealed record Result(int Code, string Out, string Err, bool TimedOut)
    {
        public bool Ok => Code == 0 && !TimedOut;
    }

    // The adb server must be started on its own first: a server started by a
    // command whose output is redirected keeps that pipe open, and reading
    // the output would then never finish.
    public async Task StartServerAsync()
    {
        var psi = new ProcessStartInfo(Path) { UseShellExecute = false, CreateNoWindow = true };
        psi.ArgumentList.Add("start-server");
        using var p = Process.Start(psi);
        if (p == null) return;
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try { await p.WaitForExitAsync(cts.Token); }
        catch (OperationCanceledException) { TryKill(p); }
    }

    public async Task<Result> RunAsync(TimeSpan timeout, params string[] args)
    {
        var psi = new ProcessStartInfo(Path)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        using var p = new Process { StartInfo = psi };
        p.Start();
        var stdout = p.StandardOutput.ReadToEndAsync();
        var stderr = p.StandardError.ReadToEndAsync();
        using var cts = new CancellationTokenSource(timeout);
        try
        {
            await p.WaitForExitAsync(cts.Token);
            return new Result(p.ExitCode, await stdout, await stderr, false);
        }
        catch (OperationCanceledException)
        {
            TryKill(p);
            return new Result(-1, "", "timed out", true);
        }
    }

    private static void TryKill(Process p)
    {
        try { if (!p.HasExited) p.Kill(true); } catch { /* already gone */ }
    }
}
