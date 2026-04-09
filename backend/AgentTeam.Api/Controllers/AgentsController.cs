using AgentTeam.Api.Data;
using AgentTeam.Api.DTOs;
using AgentTeam.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/agents")]
public class AgentsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var agents = await db.Agents
            .Include(a => a.Template)
            .Include(a => a.Tasks) // Include tasks to check status
            .OrderByDescending(a => a.UpdatedAt)
            .ToListAsync();
        
        var dtos = agents.Select(a => ToDto(a)).ToList();
        return Ok(dtos);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var a = await db.Agents
            .Include(a => a.Template)
            .Include(a => a.Tasks)
            .FirstOrDefaultAsync(x => x.Id == id);
            
        if (a == null) return NotFound();
        return Ok(ToDto(a));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAgentRequest req)
    {
        if (!string.IsNullOrEmpty(req.WorkingDirectory) && !Directory.Exists(req.WorkingDirectory))
            return BadRequest(new { error = $"工作目录不存在: {req.WorkingDirectory}" });

        var template = await db.AgentTemplates.FindAsync(req.TemplateId);
        if (template == null) return BadRequest(new { error = $"未找到Template: {req.TemplateId}" });

        var agent = new Agent
        {
            Name = req.Name,
            TemplateId = req.TemplateId,
            Template = template,
            WorkingDirectory = req.WorkingDirectory,
            AllowedModels = req.AllowedModels,
            MaxTurns = req.MaxTurns
        };
        db.Agents.Add(agent);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = agent.Id }, ToDto(agent));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAgentRequest req)
    {
        var agent = await db.Agents.Include(a => a.Template).Include(a => a.Tasks).FirstOrDefaultAsync(a => a.Id == id);
        if (agent == null) return NotFound();

        if (!string.IsNullOrEmpty(req.WorkingDirectory) && !Directory.Exists(req.WorkingDirectory))
            return BadRequest(new { error = $"工作目录不存在: {req.WorkingDirectory}" });

        var template = await db.AgentTemplates.FindAsync(req.TemplateId);
        if (template == null) return BadRequest(new { error = $"未找到Template: {req.TemplateId}" });

        agent.Name = req.Name;
        agent.TemplateId = req.TemplateId;
        agent.Template = template;
        agent.WorkingDirectory = req.WorkingDirectory;
        agent.AllowedModels = req.AllowedModels;
        agent.MaxTurns = req.MaxTurns;
        agent.IsEnabled = req.IsEnabled;
        agent.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(ToDto(agent));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var agent = await db.Agents.FindAsync(id);
        if (agent == null) return NotFound();
        db.Agents.Remove(agent);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/toggle-pin")]
    public async Task<IActionResult> TogglePin(Guid id)
    {
        var agent = await db.Agents.FindAsync(id);
        if (agent == null) return NotFound();
        agent.IsPinned = !agent.IsPinned;
        await db.SaveChangesAsync();
        return Ok(new { isPinned = agent.IsPinned });
    }

    private static AgentDto ToDto(Agent a)
    {
        var status = a.Tasks?.Any(t => t.Status == Models.TaskStatus.Running) ?? false ? "working" : "idle";
        var latestTask = a.Tasks?.OrderByDescending(t => t.CreatedAt).FirstOrDefault();
        
        return new AgentDto(
            a.Id, a.Name, a.TemplateId, 
            a.Template == null ? null : new AgentTemplateDto(a.Template.Id, a.Template.Name, a.Template.Description, a.Template.SystemPrompt, a.Template.IsEnabled, a.Template.CreatedAt, a.Template.UpdatedAt), 
            a.WorkingDirectory, a.AllowedModels, a.MaxTurns, a.IsEnabled, 
            status,
            latestTask?.Prompt,
            latestTask?.Id,
            a.IsPinned,
            a.LastUsedAt,
            a.CreatedAt, a.UpdatedAt);
    }
}
