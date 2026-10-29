using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TowerForge.Server.Data;

namespace TowerForge.Server.Controllers;

// ============================================================
//  Ask AI reports.
//  POST: a signed-in account that can see Ask AI (the "ai" preview)
//  sends an answer it chose to report. Everything else — listing,
//  marking fixed, deleting — is for accounts with the "ai-admin"
//  preview (the owner; features.json on the server).
// ============================================================
[ApiController]
[Route("api/ai-reports")]
[Authorize]
public class AiReportsController : ControllerBase
{
    // A report is the question, the answer and the data it looked at (a
    // few thousand characters each at most).
    public const int MaxReportBytes = 128 * 1024;
    private static readonly string[] Statuses = ["open", "fixed"];

    private readonly AiReportStore _reports;
    private readonly PreviewFeatures _previews;

    public AiReportsController(AiReportStore reports, PreviewFeatures previews)
    {
        _reports = reports;
        _previews = previews;
    }

    public record StatusRequest(string Status);

    [HttpPost]
    [RequestSizeLimit(MaxReportBytes)]
    [EnableRateLimiting("ai-report")]
    public async Task<IActionResult> Create([FromBody] JsonElement body)
    {
        if (!Has("ai")) return Forbid();
        if (body.ValueKind != JsonValueKind.Object)
            return BadRequest(new { error = "A report must be a JSON object." });
        var data = JsonNode.Parse(body.GetRawText())!.AsObject();
        if (data["question"] is not JsonValue q || q.GetValueKind() != JsonValueKind.String || string.IsNullOrWhiteSpace(q.GetValue<string>()))
            return BadRequest(new { error = "A report needs the question." });
        var id = await _reports.CreateAsync(CurrentUserId(), data);
        return Ok(new { id });
    }

    // GET /api/ai-reports?status=open|fixed — newest first.
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] int limit = 200)
    {
        if (!Has("ai-admin")) return Forbid();
        if (status is not null && !Statuses.Contains(status)) return BadRequest(new { error = "Unknown status." });
        var list = await _reports.ListAsync(status, limit);
        return Ok(list.Select(r => new { r.Id, r.Username, r.CreatedAt, r.Status, r.Data }));
    }

    [HttpPatch("{id:long}")]
    public async Task<IActionResult> SetStatus(long id, [FromBody] StatusRequest req)
    {
        if (!Has("ai-admin")) return Forbid();
        if (!Statuses.Contains(req.Status)) return BadRequest(new { error = "Unknown status." });
        return await _reports.SetStatusAsync(id, req.Status) ? NoContent() : NotFound();
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id)
    {
        if (!Has("ai-admin")) return Forbid();
        return await _reports.DeleteAsync(id) ? NoContent() : NotFound();
    }

    private bool Has(string feature) =>
        User.Identity?.Name is { } name && _previews.For(name).Contains(feature);

    private long? CurrentUserId() =>
        long.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}
