// ============================================================
//  TowerForge Link — Google's adb (Android SDK Platform-Tools)
//  Phones need a recent adb: wireless debugging's pairing came with
//  platform-tools 30 (adb 1.0.41), and emulators ship old ones
//  (BlueStacks 5.22: adb 1.0.36). Link uses one already on this PC
//  (its own copy, the Android SDK folder or PATH); otherwise, when the
//  player asks from the site, it downloads Google's package from
//  Google and keeps only adb.exe and its two DLLs, in
//    %LOCALAPPDATA%\TowerForgeLink\platform-tools\
//  Emulators don't need it: they keep using their own adb.
// ============================================================

using System.IO.Compression;

namespace TowerForge.Link;

internal static class PlatformTools
{
    public const string DownloadUrl = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip";
    public static readonly string Folder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TowerForgeLink", "platform-tools");
    private static readonly Version Pairing = new(1, 0, 41);
    private static readonly string[] Keep = ["adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll", "NOTICE.txt"];

    // adb's version per file (path + write time): asking costs a process.
    private static readonly Dictionary<string, Version?> Versions = new();

    public sealed record Found(string Path, Version Version);

    // The first adb on this PC that can pair with phones, or null.
    public static async Task<Found?> FindAsync()
    {
        foreach (var path in Candidates())
        {
            if (!File.Exists(path)) continue;
            var v = await VersionOfAsync(path);
            if (v != null && v >= Pairing) return new Found(path, v);
        }
        return null;
    }

    private static IEnumerable<string> Candidates()
    {
        yield return Path.Combine(Folder, "adb.exe");
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Android", "Sdk", "platform-tools", "adb.exe");
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            string? p = null;
            try { if (dir.Trim().Length > 0) p = Path.Combine(dir.Trim(), "adb.exe"); }
            catch (ArgumentException) { /* a malformed PATH entry */ }
            if (p != null) yield return p;
        }
    }

    // "Android Debug Bridge version 1.0.41" on the first line.
    private static async Task<Version?> VersionOfAsync(string path)
    {
        var key = $"{path}|{File.GetLastWriteTimeUtc(path).Ticks}";
        if (Versions.TryGetValue(key, out var known)) return known;
        var r = await new Adb(path).RunAsync(TimeSpan.FromSeconds(10), "version");
        var line = r.Out.Split('\n').FirstOrDefault(l => l.StartsWith("Android Debug Bridge version", StringComparison.Ordinal));
        Version? v = line != null && Version.TryParse(line["Android Debug Bridge version".Length..].Trim(), out var parsed) ? parsed : null;
        Versions[key] = v;
        return v;
    }

    // Downloads Google's platform-tools and keeps adb. Throws ExportProblem.
    public static async Task<Found> DownloadAsync(Action<string> log)
    {
        log("Downloading Google's adb (Android SDK Platform-Tools) from dl.google.com…");
        byte[] zip;
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(3) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd($"TowerForgeLink/{Program.Version}");
            zip = await http.GetByteArrayAsync(DownloadUrl);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new ExportProblem("adb_download_failed",
                "Couldn't download Google's adb. Check this PC's internet connection, then try again.");
        }

        var temp = Folder + ".new";
        try
        {
            if (Directory.Exists(temp)) Directory.Delete(temp, true);
            Directory.CreateDirectory(temp);
            using (var archive = new ZipArchive(new MemoryStream(zip), ZipArchiveMode.Read))
            {
                foreach (var name in Keep)
                {
                    var entry = archive.GetEntry($"platform-tools/{name}");
                    if (entry == null && name != "NOTICE.txt")
                    {
                        throw new ExportProblem("adb_download_failed", $"Google's package didn't have {name} in it. Try again later.");
                    }
                    entry?.ExtractToFile(Path.Combine(temp, name), true);
                }
            }
            if (Directory.Exists(Folder))
            {
                // Its adb server would keep adb.exe locked.
                var old = Path.Combine(Folder, "adb.exe");
                if (File.Exists(old)) await new Adb(old).RunAsync(TimeSpan.FromSeconds(10), "kill-server");
                Directory.Delete(Folder, true);
            }
            Directory.Move(temp, Folder);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidDataException)
        {
            throw new ExportProblem("adb_download_failed", $"Couldn't unpack Google's adb: {ex.Message}");
        }

        var found = await FindAsync();
        if (found == null || !found.Path.StartsWith(Folder, StringComparison.OrdinalIgnoreCase))
        {
            throw new ExportProblem("adb_download_failed", "Downloaded Google's adb, but it didn't start. Try again.");
        }
        log($"Google's adb {found.Version} is ready ({Folder}).");
        return found;
    }
}
