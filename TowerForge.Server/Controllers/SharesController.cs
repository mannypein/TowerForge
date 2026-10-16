using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TowerForge.Server.Data;

namespace TowerForge.Server.Controllers;

// ============================================================
//  Read-only share snapshots.
//  A share is a copy of the sender's selected stats. Viewers can
//  only read it; nothing in any other player's data is modified.
// ============================================================
[ApiController]
[Route("api/shares")]
public class SharesController : ControllerBase
{
    // Keep in sync with the client's MAX_SHARE_BYTES message.
    public const int MaxPayloadBytes = 512 * 1024;

    private static readonly Regex CodePattern = new(@"^[A-Z2-9]{8}$", RegexOptions.Compiled);

    private readonly ShareStore _shares;

    public SharesController(ShareStore shares) => _shares = shares;

    // POST /api/shares — body is the snapshot object.
    // Signed in: returns { code } and the share is listed on the account.
    // Anonymous: returns { code, claimToken } so the browser can claim it later.
    [HttpPost]
    [RequestSizeLimit(MaxPayloadBytes)]
    [EnableRateLimiting("share-create")]
    public async Task<IActionResult> Create([FromBody] JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
            return BadRequest(new { error = "Share payload must be a JSON object." });

        var data = JsonNode.Parse(body.GetRawText())!.AsObject();
        var (code, claimToken) = await _shares.CreateAsync(data, CurrentUserId());
        return claimToken is null ? Ok(new { code }) : Ok(new { code, claimToken });
    }

    // GET /api/shares/{code} — returns the snapshot data, or 404 if missing/expired.
    [HttpGet("{code}")]
    public async Task<IActionResult> Get(string code)
    {
        code = code.Trim().ToUpperInvariant();
        if (!CodePattern.IsMatch(code))
            return NotFound(new { error = "Share not found." });

        var data = await _shares.GetDataAsync(code);
        return data is null
            ? NotFound(new { error = "Share not found or expired." })
            : Content(data, "application/json");
    }

    // DELETE /api/shares/{code} — owner (signed in) or holder of the
    // anonymous claim token (X-Share-Token header) only.
    [HttpDelete("{code}")]
    public async Task<IActionResult> Delete(string code, [FromHeader(Name = "X-Share-Token")] string? claimToken)
    {
        code = code.Trim().ToUpperInvariant();
        var deleted = CodePattern.IsMatch(code)
            && await _shares.DeleteAsync(code, CurrentUserId(), claimToken);
        return deleted ? NoContent() : NotFound(new { error = "Share not found." });
    }

    private long? CurrentUserId() =>
        long.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}
