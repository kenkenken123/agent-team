using AgentTeam.Api.Data;
using AgentTeam.Api.DTOs;
using AgentTeam.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/agent-groups")]
public class AgentGroupsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var groups = await db.AgentGroups
            .OrderBy(g => g.SortOrder)
            .ThenBy(g => g.CreatedAt)
            .ToListAsync();

        var dtos = groups.Select(g => ToDto(g, 0)).ToList();
        return Ok(dtos);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var group = await db.AgentGroups
            .Include(g => g.Agents)
            .FirstOrDefaultAsync(g => g.Id == id);

        if (group == null) return NotFound();
        return Ok(ToDto(group, group.Agents.Count));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAgentGroupRequest req)
    {
        var group = new AgentGroup
        {
            Name = req.Name,
            Description = req.Description,
            Color = req.Color,
            SortOrder = req.SortOrder
        };
        db.AgentGroups.Add(group);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = group.Id }, ToDto(group, 0));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAgentGroupRequest req)
    {
        var group = await db.AgentGroups.FindAsync(id);
        if (group == null) return NotFound();

        group.Name = req.Name;
        group.Description = req.Description;
        group.Color = req.Color;
        group.SortOrder = req.SortOrder;
        group.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(ToDto(group, 0));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var group = await db.AgentGroups.FindAsync(id);
        if (group == null) return NotFound();

        // 将该组下的所有 Agent 的 GroupId 置为 null
        var agents = await db.Agents.Where(a => a.GroupId == id).ToListAsync();
        foreach (var agent in agents)
        {
            agent.GroupId = null;
        }

        db.AgentGroups.Remove(group);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static AgentGroupDto ToDto(AgentGroup g, int agentCount)
    {
        return new AgentGroupDto(
            g.Id, g.Name, g.Description, g.Color, g.SortOrder,
            agentCount, g.CreatedAt, g.UpdatedAt);
    }
}
