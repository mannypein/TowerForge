// ============================================================
//  TowerForge Link — MuMu without adb
//  MuMu Player 6 can run with its ADB port shut although ADB debug is
//  on: on the owner's PC (6.8.5, Hyper-V, 2026-10-25) Android had
//  booted and adbd was running, but nothing listened on the instance's
//  port and MuMu's own `MuMuManager.exe adb -v 0 -c connect` answered
//  "vm not ready, can not connect adb". MuMu's manager reaches the
//  instance another way — `MuMuManager.exe sh -v <n> -c <command>` —
//  so when an instance gives adb no device, Link asks that instead,
//  with two fixed commands on the export's own path and nothing else:
//    stat -c '%s %Y' <file>    its size and modified time (no copy)
//    cat <file> | base64       the file, as text that can't be mangled
//                              on the way (checked: the decoded bytes
//                              are the file, size for size)
//  Read only; nothing in the emulator is changed.
// ============================================================

namespace TowerForge.Link;

internal static class MuMuShell
{
    private const string File = "/sdcard/Android/data/" + Exporter.Package + "/files/tool_export.json";
    private static readonly TimeSpan Quick = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan Copy = TimeSpan.FromSeconds(60);

    // The export's size and time on that instance; null when MuMu can't
    // reach it, NoFile when it answered but there's no export.
    public static readonly (long Size, long Modified) NoFile = (-1, 0);

    public static async Task<(long Size, long Modified)?> StatAsync(string manager, int index)
    {
        var r = await RunAsync(manager, index, $"stat -c '%s %Y' {File} 2>/dev/null || echo none", Quick);
        if (r == null) return null;
        var parts = r.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 2 && long.TryParse(parts[0], out var size) && long.TryParse(parts[1], out var mtime)) return (size, mtime);
        return parts is ["none"] ? NoFile : null;
    }

    public static async Task<byte[]?> ReadAsync(string manager, int index)
    {
        var r = await RunAsync(manager, index, $"cat {File} | base64", Copy);
        if (string.IsNullOrWhiteSpace(r)) return null;
        try { return Convert.FromBase64String(string.Concat(r.Where(c => !char.IsWhiteSpace(c)))); }
        catch (FormatException) { return null; }
    }

    // MuMuManager prints the command's output; a JSON error ({"errcode": …})
    // when the instance can't be reached.
    private static async Task<string?> RunAsync(string manager, int index, string command, TimeSpan timeout)
    {
        // Adb's runner starts any program (arguments passed as a list, no shell).
        var r = await new Adb(manager).RunAsync(timeout, "sh", "-v", index.ToString(), "-c", command);
        if (r.TimedOut || r.Out.TrimStart().StartsWith('{') && r.Out.Contains("errcode")) return null;
        return r.Out;
    }
}
