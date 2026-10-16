using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;

namespace TowerForge.Server.Data;

// ============================================================
//  Accounts and their synced stats.
//  Passwords are hashed with ASP.NET Core Identity's
//  PasswordHasher (PBKDF2); plain passwords are never stored.
// ============================================================
public sealed class UserStore
{
    public record User(long Id, string Username, string PasswordHash);
    public record Save(string Data, DateTimeOffset UpdatedAt);

    private readonly AppDb _db;
    private readonly PasswordHasher<string> _hasher = new();

    // Verified against when a username doesn't exist, so a failed login
    // takes the same time whether or not the account is real.
    private readonly string _dummyHash;

    public UserStore(AppDb db)
    {
        _db = db;
        _dummyHash = _hasher.HashPassword("", Guid.NewGuid().ToString());
    }

    // Returns null when the username is already taken.
    public async Task<User?> CreateAsync(string username, string password, string? saveData)
    {
        var hash = _hasher.HashPassword(username, password);
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        await using var conn = await _db.OpenAsync();
        await using var tx = (SqliteTransaction)await conn.BeginTransactionAsync();

        long id;
        await using (var cmd = conn.CreateCommand())
        {
            cmd.Transaction = tx;
            cmd.CommandText = """
                INSERT OR IGNORE INTO users (username, password_hash, created_at)
                VALUES ($username, $hash, $now);
                SELECT changes(), last_insert_rowid();
                """;
            cmd.Parameters.AddWithValue("$username", username);
            cmd.Parameters.AddWithValue("$hash", hash);
            cmd.Parameters.AddWithValue("$now", now);

            await using var reader = await cmd.ExecuteReaderAsync();
            await reader.ReadAsync();
            if (reader.GetInt64(0) == 0) return null;
            id = reader.GetInt64(1);
        }

        if (saveData is not null)
        {
            await using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "INSERT INTO user_saves (user_id, data, updated_at) VALUES ($id, $data, $now)";
            cmd.Parameters.AddWithValue("$id", id);
            cmd.Parameters.AddWithValue("$data", saveData);
            cmd.Parameters.AddWithValue("$now", now);
            await cmd.ExecuteNonQueryAsync();
        }

        await tx.CommitAsync();
        return new User(id, username, hash);
    }

    // Returns the user when the username/password pair is valid.
    public async Task<User?> VerifyAsync(string username, string password)
    {
        var user = await FindByUsernameAsync(username);
        var hash = user?.PasswordHash ?? _dummyHash;
        var result = _hasher.VerifyHashedPassword(user?.Username ?? "", hash, password);
        return user is not null && result != PasswordVerificationResult.Failed ? user : null;
    }

    public async Task<User?> FindByIdAsync(long id)
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT id, username, password_hash FROM users WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? new User(reader.GetInt64(0), reader.GetString(1), reader.GetString(2)) : null;
    }

    public async Task<Save?> GetSaveAsync(long userId)
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT data, updated_at FROM user_saves WHERE user_id = $id";
        cmd.Parameters.AddWithValue("$id", userId);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync()
            ? new Save(reader.GetString(0), DateTimeOffset.FromUnixTimeSeconds(reader.GetInt64(1)))
            : null;
    }

    public async Task<DateTimeOffset> PutSaveAsync(long userId, string data)
    {
        var now = DateTimeOffset.UtcNow;
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            INSERT INTO user_saves (user_id, data, updated_at) VALUES ($id, $data, $now)
            ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
            """;
        cmd.Parameters.AddWithValue("$id", userId);
        cmd.Parameters.AddWithValue("$data", data);
        cmd.Parameters.AddWithValue("$now", now.ToUnixTimeSeconds());
        await cmd.ExecuteNonQueryAsync();
        return now;
    }

    private async Task<User?> FindByUsernameAsync(string username)
    {
        await using var conn = await _db.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT id, username, password_hash FROM users WHERE username = $username";
        cmd.Parameters.AddWithValue("$username", username);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? new User(reader.GetInt64(0), reader.GetString(1), reader.GetString(2)) : null;
    }
}
