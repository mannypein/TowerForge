using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TowerForge.Server.Data;

namespace TowerForge.Server.Controllers;

// ============================================================
//  Accounts: register, sign in/out, synced stats, and the
//  player's own share codes.
//  Registering uploads whatever the player had entered locally;
//  signing in to an existing account never uploads local data.
// ============================================================
[ApiController]
[Route("api/account")]
public class AccountController : ControllerBase
{
    // Full TowerForge export (module library included) — generous headroom.
    private const int MaxSaveBytes = 2 * 1024 * 1024;

    private static readonly Regex UsernamePattern = new(@"^[A-Za-z0-9_-]{3,24}$", RegexOptions.Compiled);
    private const int MinPasswordLength = 8;
    private const int MaxPasswordLength = 128;

    private readonly UserStore _users;
    private readonly ShareStore _shares;

    public AccountController(UserStore users, ShareStore shares)
    {
        _users = users;
        _shares = shares;
    }

    public record ShareClaim(string Code, string Token);
    public record RegisterRequest(string Username, string Password, JsonElement? Save, List<ShareClaim>? Claims);
    public record LoginRequest(string Username, string Password);

    // POST /api/account/register
    [HttpPost("register")]
    [RequestSizeLimit(MaxSaveBytes)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var username = req.Username?.Trim() ?? "";
        if (!UsernamePattern.IsMatch(username))
            return BadRequest(new { error = "Usernames are 3–24 characters: letters, numbers, _ and -." });
        if ((req.Password?.Length ?? 0) < MinPasswordLength || req.Password!.Length > MaxPasswordLength)
            return BadRequest(new { error = $"Passwords must be at least {MinPasswordLength} characters." });

        string? saveData = null;
        if (req.Save is { ValueKind: JsonValueKind.Object } save)
            saveData = save.GetRawText();

        var user = await _users.CreateAsync(username, req.Password, saveData);
        if (user is null)
            return Conflict(new { error = "That username is already taken." });

        if (req.Claims is { Count: > 0 })
            await _shares.ClaimAsync(user.Id, req.Claims.Select(c => (c.Code, c.Token)));

        await SignInAsync(user);
        return Ok(new { username = user.Username });
    }

    // POST /api/account/login — returns the account's saved stats so the
    // client can load them onto this device.
    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var user = await _users.VerifyAsync(req.Username?.Trim() ?? "", req.Password ?? "");
        if (user is null)
            return Unauthorized(new { error = "Incorrect username or password." });

        await SignInAsync(user);
        var save = await _users.GetSaveAsync(user.Id);
        return Ok(new
        {
            username = user.Username,
            save = ParseSave(save),
            updatedAt = save?.UpdatedAt,
        });
    }

    // POST /api/account/logout
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    // GET /api/account/me — 200 { username } when signed in, else 401.
    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var user = await CurrentUserAsync();
        if (user is null)
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Unauthorized();
        }
        return Ok(new { username = user.Username });
    }

    // GET /api/account/save — the account's synced stats.
    [Authorize]
    [HttpGet("save")]
    public async Task<IActionResult> GetSave()
    {
        var save = await _users.GetSaveAsync(CurrentUserId());
        return Ok(new
        {
            save = ParseSave(save),
            updatedAt = save?.UpdatedAt,
        });
    }

    // PUT /api/account/save — replaces the account's synced stats.
    [Authorize]
    [HttpPut("save")]
    [RequestSizeLimit(MaxSaveBytes)]
    [EnableRateLimiting("save")]
    public async Task<IActionResult> PutSave([FromBody] JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
            return BadRequest(new { error = "Save must be a JSON object." });

        var updatedAt = await _users.PutSaveAsync(CurrentUserId(), body.GetRawText());
        return Ok(new { updatedAt });
    }

    // GET /api/account/shares — the player's active share codes.
    [Authorize]
    [HttpGet("shares")]
    public async Task<IActionResult> Shares() =>
        Ok(await _shares.ListForOwnerAsync(CurrentUserId()));

    // Standalone element (no JsonDocument to dispose) for the response body.
    private static JsonElement? ParseSave(UserStore.Save? save) =>
        save is null ? null : JsonSerializer.Deserialize<JsonElement>(save.Data);

    private long CurrentUserId() =>
        long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private Task<UserStore.User?> CurrentUserAsync() =>
        _users.FindByIdAsync(CurrentUserId());

    private Task SignInAsync(UserStore.User user)
    {
        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
            ],
            CookieAuthenticationDefaults.AuthenticationScheme);

        return HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true });
    }
}
