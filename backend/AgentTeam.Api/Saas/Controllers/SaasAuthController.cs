using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using AgentTeam.Api.Saas.DTOs;
using AgentTeam.Api.Saas.Models;
using AgentTeam.Api.Saas.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System;
using System.Threading.Tasks;

namespace AgentTeam.Api.Saas.Controllers;

[ApiController]
[Route("api/saas/auth")]
public class SaasAuthController(
    AgentSaasContext db,
    JwtService jwtService,
    AppDbContext appDb,
    IConfiguration configuration) : ControllerBase
{
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
        {
            return BadRequest(new { error = "用户名和密码不能为空。" });
        }

        var username = req.Username.Trim();
        var exists = await db.Users.AnyAsync(u => u.Username.ToLower() == username.ToLower());
        if (exists)
        {
            return BadRequest(new { error = "用户名已存在。" });
        }

        var user = new SaasUser
        {
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password)
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var userRoot = SaasPathHelper.GetUserRoot(user.Id);

        // 自动为新租户创建一个默认 Agent
        var defaultTemplate = await appDb.AgentTemplates.FirstOrDefaultAsync(t => t.IsEnabled);
        if (defaultTemplate != null)
        {
            var defaultAgent = new Agent
            {
                Name = "专属助手",
                TemplateId = defaultTemplate.Id,
                Template = defaultTemplate,
                WorkingDirectory = userRoot,
                AllowedModels = "claude-3-7-sonnet-20250219",
                MaxTurns = 30,
                SaasUserId = user.Id
            };
            appDb.Agents.Add(defaultAgent);
            await appDb.SaveChangesAsync();
        }

        var token = jwtService.GenerateToken(user);
        return Ok(new AuthResponse(token, new UserDto(user.Id, user.Username, user.CreatedAt)));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
        {
            return BadRequest(new { error = "用户名和密码不能为空。" });
        }

        var username = req.Username.Trim();

        // ── 管理员检查（优先匹配，直接比较配置文件明文密码）──────────
        var adminUsername = configuration["Admin:Username"];
        var adminPassword = configuration["Admin:Password"];
        if (!string.IsNullOrEmpty(adminUsername)
            && string.Equals(username, adminUsername, StringComparison.OrdinalIgnoreCase)
            && req.Password == adminPassword)
        {
            var adminToken = jwtService.GenerateAdminToken(username);
            return Ok(new AuthResponse(adminToken, null, IsAdmin: true));
        }

        // ── 普通租户登录 ──────────────────────────────────────────────
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == username.ToLower());
        if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            return BadRequest(new { error = "用户名或密码不正确。" });
        }

        var token = jwtService.GenerateToken(user);
        return Ok(new AuthResponse(token, new UserDto(user.Id, user.Username, user.CreatedAt)));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        try
        {
            var userId = GetUserId();
            var user = await db.Users.FindAsync(userId);
            if (user == null)
            {
                return NotFound(new { error = "用户未找到。" });
            }
            return Ok(new UserDto(user.Id, user.Username, user.CreatedAt));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
    }

    private Guid GetUserId()
    {
        var nameIdentifier = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(nameIdentifier) || !Guid.TryParse(nameIdentifier, out var userId))
        {
            throw new UnauthorizedAccessException("未登录或 Token 无效。");
        }
        return userId;
    }
}
