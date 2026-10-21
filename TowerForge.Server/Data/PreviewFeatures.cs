using System.Text.Json;

namespace TowerForge.Server.Data;

// ============================================================
//  Preview features: parts of the site still being tried out,
//  shown only to the accounts listed for them.
//  The list is features.json in the data directory — on the
//  server, never in the repo (the usernames are private):
//      { "ai": ["SomeUser", "OtherUser"] }
//  Usernames match in any case. The file is read again when it
//  changes, so adding someone needs no restart; a missing or
//  broken file means no previews for anyone.
// ============================================================
public sealed class PreviewFeatures
{
    private readonly string _path;
    private readonly ILogger<PreviewFeatures> _log;
    private readonly object _gate = new();
    private DateTime _stamp = DateTime.MinValue;
    private Dictionary<string, HashSet<string>> _byFeature = new();

    public PreviewFeatures(string path, ILogger<PreviewFeatures> log)
    {
        _path = path;
        _log = log;
    }

    // The preview features this account can see (sorted; empty for most).
    public string[] For(string username)
    {
        var features = Load();
        return features
            .Where(f => f.Value.Contains(username))
            .Select(f => f.Key)
            .OrderBy(f => f, StringComparer.Ordinal)
            .ToArray();
    }

    private Dictionary<string, HashSet<string>> Load()
    {
        lock (_gate)
        {
            var stamp = File.Exists(_path) ? File.GetLastWriteTimeUtc(_path) : DateTime.MinValue;
            if (stamp == _stamp) return _byFeature;
            _stamp = stamp;
            _byFeature = new();
            if (stamp == DateTime.MinValue) return _byFeature;
            try
            {
                var raw = JsonSerializer.Deserialize<Dictionary<string, string[]>>(File.ReadAllText(_path)) ?? new();
                foreach (var (feature, users) in raw)
                    _byFeature[feature] = new HashSet<string>(users ?? [], StringComparer.OrdinalIgnoreCase);
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
            {
                _log.LogWarning(ex, "Could not read {Path}; no preview features until it's fixed", _path);
            }
            return _byFeature;
        }
    }
}
