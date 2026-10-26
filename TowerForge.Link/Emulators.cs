// ============================================================
//  TowerForge Link — finding emulators
//  Where each Android emulator keeps its adb and which local port
//  its adb listens on.
//   • BlueStacks 5 (checked on a real install, 5.22): install and
//     data folders in the registry (HKLM\SOFTWARE\BlueStacks_nxt);
//     HD-Adb.exe; ports and the "Android Debug Bridge" setting in
//     bluestacks.conf. With that setting off BlueStacks accepts the
//     connection but closes every command; switched on in the file
//     while it ran, 5.22 applied it within a few minutes.
//   • MuMu Player (checked on a real install, 6.8.5, 2026-10-25):
//     C:\Program Files\Netease\MuMuPlayer, adb in nx_main; each
//     instance's adb port and name in vms\<instance>\configs
//     (vm_config.json vm.nat.port_forward.adb.host_port — 16384 for the
//     first — and extra_config.json playerName), the instance's number
//     from its folder (MuMuPlayerGlobal-15.0-0 → 0) for MuMuManager.exe.
//     MuMu 12's folders and default ports (16384 + 32 an instance, 7555)
//     as a fallback.
//   • LDPlayer 9, MEmu, Nox: their usual install folders and default
//     ports (from their docs and community guides — not checked on a
//     real install yet).
//   • Android's own platform-tools adb (PATH or the Android SDK
//     folder), which also reaches phones plugged in by USB.
//  adb itself also finds any emulator on ports 5555–5585 by itself.
// ============================================================

using Microsoft.Win32;

namespace TowerForge.Link;

internal sealed record EmulatorInfo(
    string Name,
    string AdbPath,
    int[] Ports,
    bool? AdbEnabled,     // BlueStacks: its "Android Debug Bridge" setting; null = not known
    bool Running,
    Dictionary<int, string>? Instances = null,   // adb port → the instance's name, when known
    string? MuMuManager = null,                   // MuMu: its MuMuManager.exe (MuMuShell.cs)
    Dictionary<int, int>? VmIndexes = null)       // MuMu: adb port → the instance's number
{
    // "MuMu Player", or "MuMu Player — Work" when it has instances on
    // more than one port and this one has a name.
    public string NameFor(int port) =>
        Instances != null && Instances.Count > 1 && Instances.TryGetValue(port, out var n)
            ? $"{Name} — {n}"
            : Name;
}

internal static class Emulators
{
    private static readonly string ProgramFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
    private static readonly string ProgramFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

    public static List<EmulatorInfo> Find()
    {
        var found = new List<EmulatorInfo>();
        found.AddRange(FindBlueStacks());
        var mumu = FindMuMu();
        if (mumu != null) found.Add(mumu);
        AddIfPresent(found, "LDPlayer", [5555, 5557, 5559, 5561], ["dnplayer", "Ld9BoxHeadless"],
            @"C:\LDPlayer\LDPlayer9\adb.exe",
            @"C:\LDPlayer\LDPlayer4.0\adb.exe",
            Path.Combine(ProgramFiles, "LDPlayer", "LDPlayer9", "adb.exe"));
        AddIfPresent(found, "MEmu", [21503, 21513, 21523], ["MEmu", "MEmuHeadless"],
            Path.Combine(ProgramFiles, "Microvirt", "MEmu", "adb.exe"));
        AddIfPresent(found, "Nox", [62001, 62025, 62026], ["Nox", "NoxVMHandle"],
            Path.Combine(ProgramFilesX86, "Nox", "bin", "nox_adb.exe"),
            Path.Combine(ProgramFiles, "Nox", "bin", "nox_adb.exe"));
        var tools = FindPlatformTools();
        if (tools != null) found.Add(new EmulatorInfo("Android platform-tools", tools, [], null, true));
        return found;
    }

    // BlueStacks 5 and its MSI and China builds share a layout.
    private static IEnumerable<EmulatorInfo> FindBlueStacks()
    {
        foreach (var key in new[] { "BlueStacks_nxt", "BlueStacks_msi5", "BlueStacks_nxt_cn" })
        {
            using var reg = Registry.LocalMachine.OpenSubKey($@"SOFTWARE\{key}");
            var install = reg?.GetValue("InstallDir") as string;
            var data = reg?.GetValue("UserDefinedDir") as string;
            if (install == null) continue;
            var adb = Path.Combine(install, "HD-Adb.exe");
            if (!File.Exists(adb)) continue;
            var conf = ReadConf(data == null ? null : Path.Combine(data, "bluestacks.conf"));
            var ports = conf
                .Where(kv => kv.Key.StartsWith("bst.instance.") && kv.Key.EndsWith("adb_port"))
                .Select(kv => int.TryParse(kv.Value, out var p) ? p : 0)
                .Where(p => p > 0)
                .Distinct()
                .ToArray();
            // bst.instance.<id>.adb_port and .display_name; instances can share a
            // port (only one runs at a time), and a shared port names no one instance.
            var names = new Dictionary<int, string>();
            foreach (var (k, value) in conf)
            {
                if (!k.StartsWith("bst.instance.") || !k.EndsWith(".adb_port") || k.EndsWith(".status.adb_port")) continue;
                var id = k["bst.instance.".Length..^".adb_port".Length];
                if (int.TryParse(value, out var port) && conf.TryGetValue($"bst.instance.{id}.display_name", out var name))
                    names[port] = names.ContainsKey(port) ? "" : name;
            }
            bool? enabled = conf.TryGetValue("bst.enable_adb_access", out var v) ? v == "1" : null;
            yield return new EmulatorInfo("BlueStacks", adb, ports.Length > 0 ? ports : [5555], enabled,
                IsRunning("HD-Player"), names.Where(kv => kv.Value.Length > 0).ToDictionary());
        }
    }

    // MuMu Player: the install folder (6.x) or MuMu 12's; its instances'
    // adb ports and names from their configs, else MuMu 12's default ports.
    private static EmulatorInfo? FindMuMu()
    {
        var roots = new[]
        {
            Path.Combine(ProgramFiles, "Netease", "MuMuPlayer"),
            Path.Combine(ProgramFiles, "Netease", "MuMuPlayer-12.0"),
            Path.Combine(ProgramFiles, "Netease", "MuMu Player 12"),
            Path.Combine(ProgramFiles, "Netease", "MuMuPlayerGlobal-12.0"),
        };
        foreach (var root in roots)
        {
            var adb = new[] { Path.Combine(root, "nx_main", "adb.exe"), Path.Combine(root, "shell", "adb.exe") }.FirstOrDefault(File.Exists);
            if (adb == null) continue;
            var names = new Dictionary<int, string>();
            var indexes = new Dictionary<int, int>();
            var vms = Path.Combine(root, "vms");
            if (Directory.Exists(vms))
            {
                foreach (var dir in Directory.GetDirectories(vms))
                {
                    var port = ReadMuMuAdbPort(Path.Combine(dir, "configs", "vm_config.json"));
                    if (port <= 0) continue;
                    names[port] = ReadMuMuName(Path.Combine(dir, "configs", "extra_config.json")) ?? Path.GetFileName(dir);
                    var folder = Path.GetFileName(dir);
                    if (int.TryParse(folder[(folder.LastIndexOf('-') + 1)..], out var index)) indexes[port] = index;
                }
            }
            int[] ports = names.Count > 0 ? [.. names.Keys.Order()] : [16384, 16416, 16448, 16480, 7555];
            var manager = new[] { Path.Combine(root, "nx_main", "MuMuManager.exe"), Path.Combine(root, "shell", "MuMuManager.exe") }
                .FirstOrDefault(File.Exists);
            return new EmulatorInfo("MuMu Player", adb, ports, null,
                new[] { "MuMuNxDevice", "MuMuVMMHeadless", "MuMuPlayer", "NemuPlayer" }.Any(IsRunning), names, manager, indexes);
        }
        return null;
    }

    private static int ReadMuMuAdbPort(string path)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(path));
            var hostPort = doc.RootElement.GetProperty("vm").GetProperty("nat").GetProperty("port_forward")
                .GetProperty("adb").GetProperty("host_port");
            return int.TryParse(hostPort.ToString(), out var p) ? p : 0;
        }
        catch { return 0; }   // missing, or another MuMu's layout
    }

    private static string? ReadMuMuName(string path)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(path));
            return doc.RootElement.TryGetProperty("playerName", out var n) && n.GetString() is { Length: > 0 } name ? name : null;
        }
        catch { return null; }
    }

    // bluestacks.conf: one key="value" per line.
    private static Dictionary<string, string> ReadConf(string? path)
    {
        var conf = new Dictionary<string, string>();
        if (path == null || !File.Exists(path)) return conf;
        foreach (var line in File.ReadLines(path))
        {
            var eq = line.IndexOf('=');
            if (eq <= 0) continue;
            conf[line[..eq].Trim()] = line[(eq + 1)..].Trim().Trim('"');
        }
        return conf;
    }

    private static void AddIfPresent(List<EmulatorInfo> found, string name, int[] ports, string[] processes, params string[] adbPaths)
    {
        var adb = adbPaths.FirstOrDefault(File.Exists);
        if (adb != null) found.Add(new EmulatorInfo(name, adb, ports, null, processes.Any(IsRunning)));
    }

    private static string? FindPlatformTools()
    {
        var sdk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Android", "Sdk", "platform-tools", "adb.exe");
        if (File.Exists(sdk)) return sdk;
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try
            {
                var p = Path.Combine(dir.Trim(), "adb.exe");
                if (dir.Length > 0 && File.Exists(p)) return p;
            }
            catch (ArgumentException) { /* a malformed PATH entry */ }
        }
        return null;
    }

    private static bool IsRunning(string process)
    {
        try { return System.Diagnostics.Process.GetProcessesByName(process).Length > 0; }
        catch { return false; }
    }
}
