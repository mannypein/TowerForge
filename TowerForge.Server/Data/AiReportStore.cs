using System.Text.Json.Nodes;

namespace TowerForge.Server.Data;

// ============================================================
//  Ask AI reports: answers a player chose to send from the Ask AI
//  page (👎 → Send), so the owner can see what goes wrong. Each is
//  the report JSON the client built (question, answer, route, what it
//  looked at, model, GPU, version, note) plus who sent it. Kept a
//  year; the owner marks them fixed or deletes them.
// ============================================================
public sealed class AiReportStore
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(365);

    private readonly AppDb _db;

    public AiReportStore(AppDb db) => _db = db;

    public record Report(long Id, string? Username, DateTimeOffset CreatedAt, string Status, JsonNode? Data);

    public async Task<long> CreateAsync(long? userId, JsonObject data)
    {
        await PurgeExpiredAsync();
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            INSERT INTO ai_reports (user_id, created_at, status, data)
            VALUES ($user, $createdAt, 'open', $data);
            SELECT last_insert_rowid();
            """;
        cmd.Parameters.AddWithValue("$user", (object?)userId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$createdAt", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        cmd.Parameters.AddWithValue("$data", data.ToJsonString());
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    // Newest first; `status` null = every report.
    public async Task<List<Report>> ListAsync(string? status, int limit)
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT r.id, u.username, r.created_at, r.status, r.data
            FROM ai_reports r LEFT JOIN users u ON u.id = r.user_id
            WHERE ($status IS NULL OR r.status = $status)
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT $limit
            """;
        cmd.Parameters.AddWithValue("$status", (object?)status ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$limit", Math.Clamp(limit, 1, 500));

        var list = new List<Report>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new Report(
                reader.GetInt64(0),
                reader.IsDBNull(1) ? null : reader.GetString(1),
                DateTimeOffset.FromUnixTimeSeconds(reader.GetInt64(2)),
                reader.GetString(3),
                JsonNode.Parse(reader.GetString(4))));
        }
        return list;
    }

    public async Task<bool> SetStatusAsync(long id, string status)
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE ai_reports SET status = $status WHERE id = $id";
        cmd.Parameters.AddWithValue("$status", status);
        cmd.Parameters.AddWithValue("$id", id);
        return await cmd.ExecuteNonQueryAsync() == 1;
    }

    public async Task<bool> DeleteAsync(long id)
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM ai_reports WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        return await cmd.ExecuteNonQueryAsync() == 1;
    }

    private async Task PurgeExpiredAsync()
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM ai_reports WHERE created_at < $cutoff";
        cmd.Parameters.AddWithValue("$cutoff", (DateTimeOffset.UtcNow - Lifetime).ToUnixTimeSeconds());
        await cmd.ExecuteNonQueryAsync();
    }
}
