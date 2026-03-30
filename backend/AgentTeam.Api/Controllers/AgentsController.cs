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
            .OrderByDescending(a => a.UpdatedAt)
            .Select(a => new AgentDto(
                a.Id, a.Name, a.Description, a.WorkingDirectory,
                a.SystemPrompt, a.Model, a.MaxTurns, a.AllowedTools,
                a.IsEnabled, a.CreatedAt, a.UpdatedAt))
            .ToListAsync();
        return Ok(agents);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var a = await db.Agents.FindAsync(id);
        if (a == null) return NotFound();
        return Ok(ToDto(a));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAgentRequest req)
    {
        if (!Directory.Exists(req.WorkingDirectory))
            return BadRequest(new { error = $"工作目录不存在: {req.WorkingDirectory}" });

        var agent = new Agent
        {
            Name = req.Name,
            Description = req.Description,
            WorkingDirectory = req.WorkingDirectory,
            SystemPrompt = req.SystemPrompt,
            Model = req.Model,
            MaxTurns = req.MaxTurns,
            AllowedTools = req.AllowedTools
        };
        db.Agents.Add(agent);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = agent.Id }, ToDto(agent));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAgentRequest req)
    {
        var agent = await db.Agents.FindAsync(id);
        if (agent == null) return NotFound();

        if (!Directory.Exists(req.WorkingDirectory))
            return BadRequest(new { error = $"工作目录不存在: {req.WorkingDirectory}" });

        agent.Name = req.Name;
        agent.Description = req.Description;
        agent.WorkingDirectory = req.WorkingDirectory;
        agent.SystemPrompt = req.SystemPrompt;
        agent.Model = req.Model;
        agent.MaxTurns = req.MaxTurns;
        agent.AllowedTools = req.AllowedTools;
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
        a.Id, a.Name, a.Description, a.WorkingDirectory,
        a.SystemPrompt, a.Model, a.MaxTurns, a.AllowedTools,
        a.IsEnabled, a.CreatedAt, a.UpdatedAt);
}
