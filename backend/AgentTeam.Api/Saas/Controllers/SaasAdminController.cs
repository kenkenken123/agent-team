using AgentTeam.Api.Saas.DTOs;
using AgentTeam.Api.Saas.Models;
using AgentTeam.Api.Saas.Services;
using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace AgentTeam.Api.Saas.Controllers;

[ApiController]
[Route("api/saas/admin")]
[Authorize(Roles = "admin")]
public class SaasAdminController(AgentSaasContext db, AppDbContext appDb) : ControllerBase
{
    // ── 用户管理 ──────────────────────────────────────────────────

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var users = await db.Users
            .OrderByDescending(u => u.CreatedAt)
            .Select(u => new AdminUserDto(u.Id, u.Username, u.CreatedAt))
            .ToListAsync();
        return Ok(users);
    }

    [HttpPost("users")]
    public async Task<IActionResult> CreateUser([FromBody] AdminCreateUserRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "用户名和密码不能为空。" });

        var username = req.Username.Trim();
        var exists = await db.Users.AnyAsync(u => u.Username.ToLower() == username.ToLower());
        if (exists)
            return BadRequest(new { error = "用户名已存在。" });

        var user = new SaasUser
        {
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password)
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        // 自动为新租户创建一个默认 Agent
        var userRoot = SaasPathHelper.GetUserRoot(user.Id);
        var defaultTemplate = await appDb.AgentTemplates.FirstOrDefaultAsync(t => t.IsEnabled);
        if (defaultTemplate != null)
        {
            appDb.Agents.Add(new Agent
            {
                Name = "专属助手",
                TemplateId = defaultTemplate.Id,
                Template = defaultTemplate,
                WorkingDirectory = userRoot,
                AllowedModels = "claude-3-7-sonnet-20250219",
                MaxTurns = 30,
                SaasUserId = user.Id
            });
            await appDb.SaveChangesAsync();
        }

        return Ok(new AdminUserDto(user.Id, user.Username, user.CreatedAt));
    }

    [HttpPut("users/{id:guid}")]
    public async Task<IActionResult> UpdateUser(Guid id, [FromBody] AdminUpdateUserRequest req)
    {
        var user = await db.Users.FindAsync(id);
        if (user == null)
            return NotFound(new { error = "用户不存在。" });

        if (!string.IsNullOrWhiteSpace(req.Username))
        {
            var newUsername = req.Username.Trim();
            var duplicate = await db.Users.AnyAsync(u => u.Username.ToLower() == newUsername.ToLower() && u.Id != id);
            if (duplicate)
                return BadRequest(new { error = "用户名已被占用。" });
            user.Username = newUsername;
        }

        if (!string.IsNullOrWhiteSpace(req.Password))
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
        }

        await db.SaveChangesAsync();
        return Ok(new AdminUserDto(user.Id, user.Username, user.CreatedAt));
    }

    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        var user = await db.Users.FindAsync(id);
        if (user == null)
            return NotFound(new { error = "用户不存在。" });

        db.Users.Remove(user);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── 模型计费配置（全局共享） ─────────────────────────────────

    [HttpGet("model-pricing")]
    public async Task<IActionResult> GetModelPricing()
    {
        var items = await db.ModelPricings
            .OrderBy(p => p.ModelId)
            .Select(p => new ModelPricingDto(p.ModelId, p.InputPricePerMillion, p.OutputPricePerMillion, p.CacheInputPricePerMillion))
            .ToListAsync();
        return Ok(items);
    }

    [HttpPost("model-pricing")]
    public async Task<IActionResult> SaveModelPricing([FromBody] SaveModelPricingRequest req)
    {
        if (req.Items == null)
            return BadRequest(new { error = "请求体不能为空。" });

        // 替换式 upsert：先删除全部，再重新插入
        var existing = await db.ModelPricings.ToListAsync();
        db.ModelPricings.RemoveRange(existing);

        var now = DateTime.UtcNow;
        foreach (var item in req.Items)
        {
            if (string.IsNullOrWhiteSpace(item.ModelId)) continue;
            db.ModelPricings.Add(new ModelPricing
            {
                ModelId = item.ModelId.Trim(),
                InputPricePerMillion = item.InputPricePerMillion,
                OutputPricePerMillion = item.OutputPricePerMillion,
                CacheInputPricePerMillion = item.CacheInputPricePerMillion,
                UpdatedAt = now
            });
        }

        await db.SaveChangesAsync();
        return Ok(new { message = "保存成功", count = req.Items.Count });
    }
}
