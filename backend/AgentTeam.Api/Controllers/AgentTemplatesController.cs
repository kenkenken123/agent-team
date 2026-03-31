using AgentTeam.Api.Data;
using AgentTeam.Api.DTOs;
using AgentTeam.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/agent-templates")]
public class AgentTemplatesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var templates = await db.AgentTemplates
            .OrderByDescending(t => t.UpdatedAt)
            .Select(t => new AgentTemplateDto(
                t.Id, t.Name, t.Description, t.SystemPrompt, t.IsEnabled, t.CreatedAt, t.UpdatedAt))
            .ToListAsync();
        return Ok(templates);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var t = await db.AgentTemplates.FindAsync(id);
        if (t == null) return NotFound();
        return Ok(new AgentTemplateDto(t.Id, t.Name, t.Description, t.SystemPrompt, t.IsEnabled, t.CreatedAt, t.UpdatedAt));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAgentTemplateRequest req)
    {
        var t = new AgentTemplate
        {
            Name = req.Name,
            Description = req.Description,
            SystemPrompt = req.SystemPrompt
        };
        db.AgentTemplates.Add(t);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = t.Id }, new AgentTemplateDto(t.Id, t.Name, t.Description, t.SystemPrompt, t.IsEnabled, t.CreatedAt, t.UpdatedAt));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAgentTemplateRequest req)
    {
        var t = await db.AgentTemplates.FindAsync(id);
        if (t == null) return NotFound();

        t.Name = req.Name;
        t.Description = req.Description;
        t.SystemPrompt = req.SystemPrompt;
        t.IsEnabled = req.IsEnabled;
        t.UpdatedAt = DateTime.UtcNow;
        
        await db.SaveChangesAsync();
        return Ok(new AgentTemplateDto(t.Id, t.Name, t.Description, t.SystemPrompt, t.IsEnabled, t.CreatedAt, t.UpdatedAt));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var t = await db.AgentTemplates.FindAsync(id);
        if (t == null) return NotFound();
        db.AgentTemplates.Remove(t);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
