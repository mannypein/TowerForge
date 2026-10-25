using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace TowerForge.Server.Data;

// ============================================================
//  Read-only share snapshots.
//  Signed-in players own their shares (listed on their account,
//  deletable any time). Anonymous shares get a claim token the
//  browser keeps, so they can be attached to an account later.
// ============================================================
public sealed class ShareStore
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(90);

    // Top-level payload keys the client knows how to render (the client's
    // SHARE_SECTIONS, engine/shareApi.ts).
    private static readonly string[] KnownSections =
        ["profile", "uw", "cards", "bots", "modules", "workshop", "labs", "relics", "guardian"];

    // No 0/O or 1/I so codes are easy to read aloud and type.
    private const string CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const int CodeLength = 8;

    private readonly AppDb _db;

    public ShareStore(AppDb db) => _db = db;

    public record ShareSummary(string Code, string[] Sections, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt);

    public static string SectionsOf(JsonObject data) =>
        string.Join(',', KnownSections.Where(data.ContainsKey));

    public static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    // Returns the new code, plus a claim token when the share is anonymous.
    public async Task<(string Code, string? ClaimToken)> CreateAsync(JsonObject data, long? ownerId)
    {
        await PurgeExpiredAsync();

        string? claimToken = ownerId is null
            ? Convert.ToHexString(RandomNumberGenerator.GetBytes(24))
            : null;

        await using var conn = await _db.OpenAsync();
        for (int attempt = 0; attempt < 5; attempt++)
        {
            var code = GenerateCode();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                INSERT OR IGNORE INTO shares (code, owner_id, claim_token_hash, sections, data, created_at)
                VALUES ($code, $owner, $claim, $sections, $data, $createdAt)
                """;
            cmd.Parameters.AddWithValue("$code", code);
            cmd.Parameters.AddWithValue("$owner", (object?)ownerId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$claim", claimToken is null ? DBNull.Value : HashToken(claimToken));
            cmd.Parameters.AddWithValue("$sections", SectionsOf(data));
            cmd.Parameters.AddWithValue("$data", data.ToJsonString());
            cmd.Parameters.AddWithValue("$createdAt", DateTimeOffset.UtcNow.ToUnixTimeSeconds());

            if (await cmd.ExecuteNonQueryAsync() == 1) return (code, claimToken);
        }

        throw new InvalidOperationException("Could not allocate a share code.");
    }

    // Returns the snapshot JSON, or null when missing or expired.
    public async Task<string?> GetDataAsync(string code)
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT data FROM shares WHERE code = $code AND created_at >= $cutoff";
        cmd.Parameters.AddWithValue("$code", code);
        cmd.Parameters.AddWithValue("$cutoff", Cutoff());
        return await cmd.ExecuteScalarAsync() as string;
    }

    public async Task<List<ShareSummary>> ListForOwnerAsync(long ownerId)
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT code, sections, created_at FROM shares
            WHERE owner_id = $owner AND created_at >= $cutoff
            ORDER BY created_at DESC
            """;
        cmd.Parameters.AddWithValue("$owner", ownerId);
        cmd.Parameters.AddWithValue("$cutoff", Cutoff());

        var list = new List<ShareSummary>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var created = DateTimeOffset.FromUnixTimeSeconds(reader.GetInt64(2));
            list.Add(new ShareSummary(
                reader.GetString(0),
                reader.GetString(1).Split(',', StringSplitOptions.RemoveEmptyEntries),
                created,
                created + Lifetime));
        }
        return list;
    }

    // Deletes when the caller owns the share, or holds the anonymous claim token.
    public async Task<bool> DeleteAsync(string code, long? ownerId, string? claimToken)
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            DELETE FROM shares WHERE code = $code AND (
                ($owner IS NOT NULL AND owner_id = $owner) OR
                ($claim IS NOT NULL AND owner_id IS NULL AND claim_token_hash = $claim)
            )
            """;
        cmd.Parameters.AddWithValue("$code", code);
        cmd.Parameters.AddWithValue("$owner", (object?)ownerId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$claim", string.IsNullOrEmpty(claimToken) ? DBNull.Value : HashToken(claimToken));
        return await cmd.ExecuteNonQueryAsync() == 1;
    }

    // Attaches anonymous shares to an account when the caller proves they made them.
    public async Task ClaimAsync(long ownerId, IEnumerable<(string Code, string Token)> claims)
    {
        await using var conn = await _db.OpenAsync();
        foreach (var (code, token) in claims.Take(200))
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                UPDATE shares SET owner_id = $owner, claim_token_hash = NULL
                WHERE code = $code AND owner_id IS NULL AND claim_token_hash = $claim
                """;
            cmd.Parameters.AddWithValue("$owner", ownerId);
            cmd.Parameters.AddWithValue("$code", code.Trim().ToUpperInvariant());
            cmd.Parameters.AddWithValue("$claim", HashToken(token));
            await cmd.ExecuteNonQueryAsync();
        }
    }

    private async Task PurgeExpiredAsync()
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM shares WHERE created_at < $cutoff";
        cmd.Parameters.AddWithValue("$cutoff", Cutoff());
        await cmd.ExecuteNonQueryAsync();
    }

    private static long Cutoff() => (DateTimeOffset.UtcNow - Lifetime).ToUnixTimeSeconds();

    private static string GenerateCode()
    {
        var chars = new char[CodeLength];
        for (int i = 0; i < CodeLength; i++)
            chars[i] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];
        return new string(chars);
    }
}
