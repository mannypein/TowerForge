// ============================================================
//  TowerForge Link — iPhone backups
//  iOS keeps the game's files in its sandbox: no app on the phone, and
//  no browser, can reach them. A backup of the iPhone to this PC
//  (Apple Devices app or iTunes, "Back up all of the data on your
//  iPhone to this computer") carries the game's Documents folder,
//  where it writes tool_export.json — players already pull the save
//  (playerInfo.dat) out of the same folder in backups
//  ("Applications/com.TechTreeGames.TheTower/Documents/" in backup
//  viewers; github.com/SFleet89/the-tower-unified-tools).
//  In a backup (iOS 10+) each file is stored under
//  SHA-1("<domain>-<relativePath>"), in a folder named by the hash's
//  first two characters; the app's domain is
//  AppDomain-com.TechTreeGames.TheTower. Backups are kept in
//    %USERPROFILE%\Apple\MobileSync\Backup        (Apple Devices app,
//                                                  iTunes from the Store)
//    %APPDATA%\Apple Computer\MobileSync\Backup   (iTunes from apple.com)
//  one folder per device. Encrypted backups ("Encrypt local backup")
//  can't be read yet — their Manifest.db isn't a plain SQLite file.
//  Read only; nothing in the backup is changed. Not yet checked
//  against a real iPhone backup (none on the owner's PC, 2026-10-23).
// ============================================================

using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;

namespace TowerForge.Link;

internal sealed record IPhoneBackup(
    string Folder,
    string? DeviceName,
    DateTime? LastBackup,
    bool Encrypted,
    string? ExportPath,      // the backed-up tool_export.json, when there is one
    long ExportModified);    // its file time (unix seconds), 0 without one

internal static class IPhoneBackups
{
    private const string Domain = "AppDomain-" + Exporter.Package;
    private const string RelativePath = "Documents/tool_export.json";

    // Set by --backups (testing with a made-up backup).
    public static string? Override { get; set; }

    private static IEnumerable<string> Roots()
    {
        if (Override != null) { yield return Override; yield break; }
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Apple", "MobileSync", "Backup");
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Apple Computer", "MobileSync", "Backup");
    }

    // Where the export is stored in a backup: the documented SHA-1 of
    // "domain-relativePath" (two- and one-level layouts), and "domain/path"
    // in case a source has it that way.
    private static IEnumerable<string> ExportCandidates(string folder)
    {
        foreach (var key in new[] { $"{Domain}-{RelativePath}", $"{Domain}/{RelativePath}" })
        {
            var hash = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(key))).ToLowerInvariant();
            yield return Path.Combine(folder, hash[..2], hash);
            yield return Path.Combine(folder, hash);
        }
    }

    public static List<IPhoneBackup> Find()
    {
        var found = new List<IPhoneBackup>();
        foreach (var root in Roots())
        {
            if (!Directory.Exists(root)) continue;
            IEnumerable<string> folders;
            try { folders = Directory.GetDirectories(root); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { continue; }
            foreach (var folder in folders)
            {
                var manifest = Path.Combine(folder, "Manifest.db");
                if (!File.Exists(manifest)) continue;   // not a backup (or one still being made)
                var (name, last) = ReadInfo(Path.Combine(folder, "Info.plist"));
                var encrypted = !IsPlainSqlite(manifest);
                var export = encrypted ? null : ExportCandidates(folder).FirstOrDefault(File.Exists);
                var modified = export == null ? 0 : new DateTimeOffset(File.GetLastWriteTimeUtc(export)).ToUnixTimeSeconds();
                found.Add(new IPhoneBackup(folder, name, last ?? File.GetLastWriteTimeUtc(manifest), encrypted, export, modified));
            }
        }
        return found.OrderByDescending(b => b.LastBackup).ToList();
    }

    // The newest backup that has the export, or null.
    public static IPhoneBackup? NewestWithExport() =>
        Find().Where(b => b.ExportPath != null).OrderByDescending(b => b.ExportModified).FirstOrDefault();

    // Info.plist (XML): "Device Name" and "Last Backup Date".
    private static (string? Name, DateTime? Last) ReadInfo(string path)
    {
        try
        {
            if (!File.Exists(path)) return (null, null);
            var dict = XDocument.Load(path).Root?.Element("dict");
            if (dict == null) return (null, null);
            string? name = null;
            DateTime? last = null;
            var items = dict.Elements().ToList();
            for (var i = 0; i + 1 < items.Count; i++)
            {
                if (items[i].Name != "key") continue;
                var value = items[i + 1];
                if (items[i].Value == "Device Name" && value.Name == "string") name = value.Value;
                if (items[i].Value == "Last Backup Date" && value.Name == "date"
                    && DateTime.TryParse(value.Value, null, System.Globalization.DateTimeStyles.AdjustToUniversal, out var d)) last = d;
            }
            return (name, last);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Xml.XmlException)
        {
            return (null, null);
        }
    }

    // An unencrypted backup's Manifest.db is a plain SQLite file.
    private static bool IsPlainSqlite(string path)
    {
        try
        {
            using var f = File.OpenRead(path);
            var head = new byte[16];
            return f.Read(head, 0, 16) == 16 && Encoding.ASCII.GetString(head) == "SQLite format 3\0";
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    public static string Describe(IPhoneBackup b) =>
        $"your iPhone backup{(b.LastBackup is DateTime d ? $" from {d.ToLocalTime():MMM d, HH:mm}" : "")}";
}
