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
            .OrderByDescending(a => a.UpdatedAt)
            .Select(a => ToDto(a))
            .ToListAsync();
        return Ok(agents);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var a = await db.Agents.Include(a => a.Template).FirstOrDefaultAsync(x => x.Id == id);
        if (a == null) return NotFound();
        return Ok(ToDto(a));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAgentRequest req)
    {
        if (!Directory.Exists(req.WorkingDirectory))
            return BadRequest(new { error = $"工作目录不存在: {req.WorkingDirectory}" });

        var template = await db.AgentTemplates.FindAsync(req.TemplateId);
        if (template == null) return BadRequest(new { error = $"未找到Template: {req.TemplateId}" });

        var agent = new Agent
        {
            Name = req.Name,
            TemplateId = req.TemplateId,
            Template = template,
            WorkingDirectory = req.WorkingDirectory,
            Model = req.Model,
            MaxTurns = req.MaxTurns
        };
        db.Agents.Add(agent);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = agent.Id }, ToDto(agent));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAgentRequest req)
    {
        var agent = await db.Agents.Include(a => a.Template).FirstOrDefaultAsync(a => a.Id == id);
        if (agent == null) return NotFound();

        if (!Directory.Exists(req.WorkingDirectory))
            return BadRequest(new { error = $"工作目录不存在: {req.WorkingDirectory}" });

        var template = await db.AgentTemplates.FindAsync(req.TemplateId);
        if (template == null) return BadRequest(new { error = $"未找到Template: {req.TemplateId}" });

        agent.Name = req.Name;
        agent.TemplateId = req.TemplateId;
        agent.Template = template;
        agent.WorkingDirectory = req.WorkingDirectory;
        agent.Model = req.Model;
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

    private static AgentDto ToDto(Agent a) => new(
        a.Id, a.Name, a.TemplateId, 
        a.Template == null ? null : new AgentTemplateDto(a.Template.Id, a.Template.Name, a.Template.Description, a.Template.SystemPrompt, a.Template.IsEnabled, a.Template.CreatedAt, a.Template.UpdatedAt), 
        a.WorkingDirectory, a.Model, a.MaxTurns, a.IsEnabled, a.CreatedAt, a.UpdatedAt);
}
