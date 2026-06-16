using AgentTeam.Api.Data;
using AgentTeam.Api.DTOs;
using AgentTeam.Api.Models;
using AgentTeam.Api.Saas.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace AgentTeam.Api.Saas.Controllers;

[Authorize]
[ApiController]
[Route("api/saas/agents")]
public class SaasAgentsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var userId = GetUserId();
            var agents = await db.Agents
                .Include(a => a.Template)
                .Include(a => a.Tasks)
                .Include(a => a.Group)
                .Where(a => a.SaasUserId == userId)
                .OrderByDescending(a => a.UpdatedAt)
                .ToListAsync();

            var dtos = agents.Select(a => ToDto(a)).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("templates")]
    public async Task<IActionResult> GetTemplates()
    {
        try
        {
            var templates = await db.AgentTemplates
                .Where(t => t.IsEnabled)
                .ToListAsync();

            var dtos = templates.Select(t => new AgentTemplateDto(t.Id, t.Name, t.Description, t.SystemPrompt, t.IsEnabled, t.CreatedAt, t.UpdatedAt)).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("models")]
    public async Task<IActionResult> GetModels()
    {
        try
        {
            var models = await db.ModelConfigs
                .Select(c => c.ModelId)
                .Distinct()
                .ToListAsync();

            if (models.Count == 0)
            {
                models.Add("claude-3-7-sonnet-20250219");
                models.Add("claude-3-5-sonnet-20241022");
            }

            return Ok(models);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var a = await db.Agents
                .Include(a => a.Template)
                .Include(a => a.Tasks)
                .Include(a => a.Group)
                .FirstOrDefaultAsync(x => x.Id == id && x.SaasUserId == userId);

            if (a == null) return NotFound();
            return Ok(ToDto(a));
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAgentRequest req)
    {
        try
        {
            var userId = GetUserId();
            var relativePath = req.WorkingDirectory ?? "";
            var safePhysicalPath = SaasPathHelper.ResolveSafe(userId, relativePath);

            var template = await db.AgentTemplates.FindAsync(req.TemplateId);
            if (template == null) return BadRequest(new { error = $"未找到Template: {req.TemplateId}" });

            var agent = new Agent
            {
                Name = req.Name,
                TemplateId = req.TemplateId,
                Template = template,
                WorkingDirectory = safePhysicalPath,
                AllowedModels = req.AllowedModels,
                MaxTurns = req.MaxTurns,
                GroupId = req.GroupId,
                SaasUserId = userId
            };

            db.Agents.Add(agent);
            await db.SaveChangesAsync();
            return CreatedAtAction(nameof(GetById), new { id = agent.Id }, ToDto(agent));
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAgentRequest req)
    {
        try
        {
            var userId = GetUserId();
            var agent = await db.Agents
                .Include(a => a.Template)
                .Include(a => a.Tasks)
                .Include(a => a.Group)
                .FirstOrDefaultAsync(a => a.Id == id && a.SaasUserId == userId);

            if (agent == null) return NotFound();

            var relativePath = req.WorkingDirectory ?? "";
            var safePhysicalPath = SaasPathHelper.ResolveSafe(userId, relativePath);

            var template = await db.AgentTemplates.FindAsync(req.TemplateId);
            if (template == null) return BadRequest(new { error = $"未找到Template: {req.TemplateId}" });

            agent.Name = req.Name;
            agent.TemplateId = req.TemplateId;
            agent.Template = template;
            agent.WorkingDirectory = safePhysicalPath;
            agent.AllowedModels = req.AllowedModels;
            agent.MaxTurns = req.MaxTurns;
            agent.IsEnabled = req.IsEnabled;
            agent.GroupId = req.GroupId;
            agent.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync();
            return Ok(ToDto(agent));
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var agent = await db.Agents.FirstOrDefaultAsync(x => x.Id == id && x.SaasUserId == userId);
            if (agent == null) return NotFound();

            db.Agents.Remove(agent);
            await db.SaveChangesAsync();
            return NoContent();
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id:guid}/toggle-pin")]
    public async Task<IActionResult> TogglePin(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var agent = await db.Agents.FirstOrDefaultAsync(x => x.Id == id && x.SaasUserId == userId);
            if (agent == null) return NotFound();

            agent.IsPinned = !agent.IsPinned;
            await db.SaveChangesAsync();
            return Ok(new { isPinned = agent.IsPinned });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
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

    private static AgentDto ToDto(Agent a)
    {
        var status = a.Tasks?.Any(t => t.Status == AgentTeam.Api.Models.TaskStatus.Running) ?? false ? "working" : "idle";
        var latestTask = a.Tasks?.OrderByDescending(t => t.CreatedAt).FirstOrDefault();

        AgentGroupDto? groupDto = null;
        if (a.Group != null)
        {
            groupDto = new AgentGroupDto(
                a.Group.Id, a.Group.Name, a.Group.Description, a.Group.Color,
                a.Group.SortOrder, 0, a.Group.CreatedAt, a.Group.UpdatedAt);
        }

        return new AgentDto(
            a.Id, a.Name, a.TemplateId,
            a.Template == null ? null : new AgentTemplateDto(a.Template.Id, a.Template.Name, a.Template.Description, a.Template.SystemPrompt, a.Template.IsEnabled, a.Template.CreatedAt, a.Template.UpdatedAt),
            a.WorkingDirectory, a.AllowedModels, a.MaxTurns, a.IsEnabled,
            status,
            latestTask?.Prompt,
            latestTask?.Id,
            a.IsPinned,
            a.LastUsedAt,
            a.GroupId,
            groupDto,
            a.CreatedAt, a.UpdatedAt);
    }
}
