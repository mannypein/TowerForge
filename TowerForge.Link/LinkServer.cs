// ============================================================
//  TowerForge Link — the link the website talks to
//  A tiny HTTP server on this PC only (127.0.0.1). towerforge.net,
//  open in a browser on the same PC, calls
//    GET http://localhost:47821/status   what the helper found
//    GET http://localhost:47821/export   the game's export file
//  Safety:
//   • listens on the loopback address only — nothing outside this PC
//     can reach it;
//   • answers pages from towerforge.net (and the local dev servers)
//     only — the browser blocks every other site from reading it;
//   • checks the Host header, so a site that points its own name at
//     127.0.0.1 (DNS rebinding) gets nothing;
//   • does one thing: read that one file. No other adb command can be
//     sent through it.
//  Chrome and Edge ask once before a site may talk to apps on the PC;
//  the preflight answers Private Network Access's header too.
// ============================================================

using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace TowerForge.Link;

internal sealed class LinkServer(int port, Action<string> log)
{
    private static readonly HashSet<string> AllowedOrigins = new(StringComparer.OrdinalIgnoreCase)
    {
        "https://towerforge.net", "https://www.towerforge.net",
        "http://localhost:5173", "http://localhost:4174", "http://127.0.0.1:5173", "http://127.0.0.1:4174",
    };

    private readonly SemaphoreSlim _oneAtATime = new(1, 1);

    public async Task RunAsync(TcpListener listener, CancellationToken stop)
    {
        while (!stop.IsCancellationRequested)
        {
            TcpClient client;
            try { client = await listener.AcceptTcpClientAsync(stop); }
            catch (OperationCanceledException) { break; }
            _ = Task.Run(() => HandleAsync(client), stop);
        }
    }

    private async Task HandleAsync(TcpClient client)
    {
        using (client)
        {
            try
            {
                var stream = client.GetStream();
                var request = await ReadRequestAsync(stream);
                if (request == null) return;
                await RespondAsync(stream, request);
            }
            catch (Exception ex) when (ex is IOException or SocketException or OperationCanceledException)
            {
                // The browser went away; nothing to answer.
            }
        }
    }

    private sealed record Request(string Method, string Path, Dictionary<string, string> Headers);

    private static async Task<Request?> ReadRequestAsync(NetworkStream stream)
    {
        var buffer = new byte[16 * 1024];
        var read = 0;
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (read < buffer.Length)
        {
            var n = await stream.ReadAsync(buffer.AsMemory(read), cts.Token);
            if (n == 0) return null;
            read += n;
            var text = Encoding.ASCII.GetString(buffer, 0, read);
            var end = text.IndexOf("\r\n\r\n", StringComparison.Ordinal);
            if (end < 0) continue;
            var lines = text[..end].Split("\r\n");
            var first = lines[0].Split(' ');
            if (first.Length < 2) return null;
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var line in lines.Skip(1))
            {
                var colon = line.IndexOf(':');
                if (colon > 0) headers[line[..colon].Trim()] = line[(colon + 1)..].Trim();
            }
            return new Request(first[0].ToUpperInvariant(), first[1].Split('?')[0], headers);
        }
        return null;
    }

    private async Task RespondAsync(NetworkStream stream, Request req)
    {
        req.Headers.TryGetValue("Host", out var host);
        if (host is null || !(host.Equals($"localhost:{port}", StringComparison.OrdinalIgnoreCase)
            || host.Equals($"127.0.0.1:{port}", StringComparison.OrdinalIgnoreCase)))
        {
            await WriteAsync(stream, 403, Error("forbidden", "Unexpected host."), null);
            return;
        }
        req.Headers.TryGetValue("Origin", out var origin);
        if (origin != null && !AllowedOrigins.Contains(origin))
        {
            log($"Refused a request from {origin} (only towerforge.net may use TowerForge Link).");
            await WriteAsync(stream, 403, Error("forbidden", "Only towerforge.net can use TowerForge Link."), null);
            return;
        }

        var cors = new Dictionary<string, string>();
        if (origin != null)
        {
            cors["Access-Control-Allow-Origin"] = origin;
            cors["Vary"] = "Origin";
            cors["Access-Control-Expose-Headers"] = "X-Export-Modified, X-Export-Source";
        }

        if (req.Method == "OPTIONS")
        {
            cors["Access-Control-Allow-Methods"] = "GET, OPTIONS";
            cors["Access-Control-Allow-Headers"] = req.Headers.TryGetValue("Access-Control-Request-Headers", out var h) ? h : "*";
            cors["Access-Control-Allow-Private-Network"] = "true";
            cors["Access-Control-Max-Age"] = "600";
            await WriteAsync(stream, 204, null, cors);
            return;
        }
        if (req.Method != "GET")
        {
            await WriteAsync(stream, 405, Error("method", "Use GET."), cors);
            return;
        }

        switch (req.Path)
        {
            case "/":
                await WriteAsync(stream, 200, ("text/plain; charset=utf-8",
                    Encoding.UTF8.GetBytes("TowerForge Link is running. Use \"Get from emulator\" on towerforge.net.")), cors);
                return;
            case "/status":
                await WriteAsync(stream, 200, Status(), cors);
                return;
            case "/export":
                await ExportAsync(stream, cors);
                return;
            default:
                await WriteAsync(stream, 404, Error("not_found", "Nothing here."), cors);
                return;
        }
    }

    private static (string, byte[]) Status() => Json(w =>
    {
        w.WriteString("app", "TowerForge Link");
        w.WriteString("version", Program.Version);
        w.WriteStartArray("emulators");
        foreach (var e in Emulators.Find())
        {
            w.WriteStartObject();
            w.WriteString("name", e.Name);
            w.WriteBoolean("running", e.Running);
            if (e.AdbEnabled is bool on) w.WriteBoolean("adbEnabled", on);
            else w.WriteNull("adbEnabled");
            w.WriteEndObject();
        }
        w.WriteEndArray();
    });

    private async Task ExportAsync(NetworkStream stream, Dictionary<string, string> cors)
    {
        await _oneAtATime.WaitAsync();
        try
        {
            log("Getting your export…");
            var file = await Exporter.ReadAsync();
            cors["X-Export-Modified"] = file.ModifiedUnix.ToString();
            cors["X-Export-Source"] = file.Source;
            var age = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeSeconds(file.ModifiedUnix);
            log($"Sent your export from {file.Source} ({file.Data.Length / 1024:N0} KB, made {Ago(age)}).");
            await WriteAsync(stream, 200, ("application/json", file.Data), cors);
        }
        catch (ExportProblem p)
        {
            log(p.Message);
            await WriteAsync(stream, 409, Error(p.Code, p.Message), cors);
        }
        catch (Exception ex)
        {
            log($"Something went wrong: {ex.Message}");
            await WriteAsync(stream, 500, Error("failed", "TowerForge Link hit an error: " + ex.Message), cors);
        }
        finally
        {
            _oneAtATime.Release();
        }
    }

    private static string Ago(TimeSpan t)
    {
        static string Unit(int n, string one) => n == 1 ? $"1 {one} ago" : $"{n} {one}s ago";
        return t.TotalMinutes < 1 ? "just now"
            : t.TotalHours < 1 ? Unit((int)t.TotalMinutes, "minute")
            : t.TotalDays < 1 ? Unit((int)t.TotalHours, "hour")
            : Unit((int)t.TotalDays, "day");
    }

    // JSON written by hand: the trimmed single-file build has no reflection serializer.
    private static (string, byte[]) Json(Action<Utf8JsonWriter> write)
    {
        using var ms = new MemoryStream();
        using (var w = new Utf8JsonWriter(ms))
        {
            w.WriteStartObject();
            write(w);
            w.WriteEndObject();
        }
        return ("application/json; charset=utf-8", ms.ToArray());
    }

    private static (string, byte[]) Error(string code, string message) => Json(w =>
    {
        w.WriteString("error", code);
        w.WriteString("message", message);
    });

    private static readonly Dictionary<int, string> Reasons = new()
    {
        [200] = "OK", [204] = "No Content", [403] = "Forbidden", [404] = "Not Found",
        [405] = "Method Not Allowed", [409] = "Conflict", [500] = "Internal Server Error",
    };

    private static async Task WriteAsync(NetworkStream stream, int status, (string Type, byte[] Body)? content, Dictionary<string, string>? headers)
    {
        var sb = new StringBuilder();
        sb.Append($"HTTP/1.1 {status} {Reasons.GetValueOrDefault(status, "OK")}\r\n");
        sb.Append("Connection: close\r\nCache-Control: no-store\r\n");
        if (headers != null) foreach (var (k, v) in headers) sb.Append($"{k}: {v}\r\n");
        var body = content?.Body ?? [];
        if (content != null) sb.Append($"Content-Type: {content.Value.Type}\r\n");
        sb.Append($"Content-Length: {body.Length}\r\n\r\n");
        await stream.WriteAsync(Encoding.ASCII.GetBytes(sb.ToString()));
        if (body.Length > 0) await stream.WriteAsync(body);
        await stream.FlushAsync();
    }
}
