// ============================================================
//  TowerForge Link — emulators installed somewhere else
//  The installers let players pick any folder or drive, so the usual
//  folders (Emulators.cs) aren't enough: a player's MuMu Player ran on
//  screen while Link said "No Android emulator found yet" (2026-10-26).
//  Two more places say where an emulator is:
//   • Windows' list of installed apps (Settings → Apps; the registry's
//     Uninstall entries): InstallLocation, and the folder of DisplayIcon;
//   • its running programs: the full path of each process
//     (QueryFullProcessImageName, which works without admin rights).
//  From each folder, the emulator's own adb is looked for in it and the
//  few folders above (MuMu's device runs from nx_device\15.0\shell, three
//  below the install folder). Read only.
// ============================================================

using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace TowerForge.Link;

internal static class InstallSearch
{
    // Testing: TOWERFORGE_LINK_NO_DEFAULTS=1 skips the usual folders, so only this search finds
    // emulators; =2 skips Windows' app list too, leaving the running programs.
    private static readonly string TestMode = Environment.GetEnvironmentVariable("TOWERFORGE_LINK_NO_DEFAULTS") ?? "";
    public static readonly bool SkipDefaultFolders = TestMode is "1" or "2";
    private static readonly bool SkipAppList = TestMode == "2";

    private static readonly string[] UninstallKeys =
    [
        @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    // Folders that may hold an emulator: where Windows says apps whose name
    // contains one of `names` are installed, and where `processes` run from.
    public static List<string> Folders(string[] names, string[] processes)
    {
        var dirs = new List<string>();
        foreach (var hive in SkipAppList ? [] : new[] { Registry.LocalMachine, Registry.CurrentUser })
        {
            foreach (var path in UninstallKeys)
            {
                try
                {
                    using var root = hive.OpenSubKey(path);
                    if (root == null) continue;
                    foreach (var sub in root.GetSubKeyNames())
                    {
                        using var key = root.OpenSubKey(sub);
                        if (key?.GetValue("DisplayName") is not string display
                            || !names.Any(n => display.Contains(n, StringComparison.OrdinalIgnoreCase))) continue;
                        if (key.GetValue("InstallLocation") is string location && location.Trim('"', ' ').Length > 0)
                            dirs.Add(location.Trim('"', ' '));
                        if (key.GetValue("DisplayIcon") is string icon
                            && Path.GetDirectoryName(icon.Split(',')[0].Trim('"', ' ')) is { Length: > 0 } iconDir)
                            dirs.Add(iconDir);
                    }
                }
                catch (Exception ex) when (ex is System.Security.SecurityException or UnauthorizedAccessException or IOException or ArgumentException)
                {
                    // a key this user can't read
                }
            }
        }
        foreach (var process in processes) dirs.AddRange(RunningFrom(process));
        return dirs;
    }

    // The first of `relative` (like nx_main\adb.exe) in any folder or up to
    // `levels` folders above it.
    public static string? FindUnder(IEnumerable<string> dirs, int levels, params string[] relative)
    {
        foreach (var start in dirs.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            DirectoryInfo? dir;
            try { dir = new DirectoryInfo(start); }
            catch (Exception ex) when (ex is ArgumentException or PathTooLongException or NotSupportedException) { continue; }
            for (var up = 0; dir != null && up <= levels; up++, dir = dir.Parent)
            {
                foreach (var rel in relative)
                {
                    var candidate = Path.Combine(dir.FullName, rel);
                    if (File.Exists(candidate)) return candidate;
                }
            }
        }
        return null;
    }

    // The first folder that `isRoot` accepts: each folder, then up to `levels`
    // above it. For emulators whose programs run from deeper folders that hold
    // their own copies of files (MuMu's nx_device\15.0\shell has an adb.exe).
    public static string? FindRoot(IEnumerable<string> dirs, int levels, Func<string, bool> isRoot)
    {
        foreach (var start in dirs.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            DirectoryInfo? dir;
            try { dir = new DirectoryInfo(start); }
            catch (Exception ex) when (ex is ArgumentException or PathTooLongException or NotSupportedException) { continue; }
            for (var up = 0; dir != null && up <= levels; up++, dir = dir.Parent)
            {
                if (isRoot(dir.FullName)) return dir.FullName;
            }
        }
        return null;
    }

    // The folders a program's running processes were started from.
    private static IEnumerable<string> RunningFrom(string process)
    {
        Process[] procs;
        try { procs = Process.GetProcessesByName(process); }
        catch (InvalidOperationException) { yield break; }
        foreach (var p in procs)
        {
            var file = ImagePath(p.Id);
            p.Dispose();
            if (file != null && Path.GetDirectoryName(file) is { Length: > 0 } dir) yield return dir;
        }
    }

    private const uint ProcessQueryLimitedInformation = 0x1000;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "QueryFullProcessImageNameW")]
    private static extern bool QueryFullProcessImageName(IntPtr process, int flags, [Out] char[] name, ref int size);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    private static string? ImagePath(int pid)
    {
        var handle = OpenProcess(ProcessQueryLimitedInformation, false, pid);
        if (handle == IntPtr.Zero) return null;
        try
        {
            var buffer = new char[1024];
            var size = buffer.Length;
            return QueryFullProcessImageName(handle, 0, buffer, ref size) ? new string(buffer, 0, size) : null;
        }
        finally { CloseHandle(handle); }
    }
}
