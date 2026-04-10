using AgentTeam.Api.Data;
using AgentTeam.Api.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/stats")]
public class StatsController(AppDbContext db) : ControllerBase
{
    [HttpGet("overview")]
    public async Task<IActionResult> Overview([FromQuery] DateTime? startDate = null, [FromQuery] DateTime? endDate = null)
    {
        var start = startDate?.Date ?? DateTime.UtcNow.Date;
        var end = endDate?.Date.AddDays(1) ?? start.AddDays(1);

        var totalAgents = await db.Agents.CountAsync(a => a.IsEnabled);
        var runningTasks = await db.Tasks.CountAsync(t =>
            t.Status == AgentTeam.Api.Models.TaskStatus.Running);
            
        var periodTasks = await db.Tasks.CountAsync(t => t.CreatedAt >= start && t.CreatedAt < end);

        var periodTokens = await db.Tasks
            .Where(t => t.CreatedAt >= start && t.CreatedAt < end)
            .Select(t => new { t.InputTokens, t.OutputTokens })
            .ToListAsync();

        var periodInputTokens = periodTokens.Sum(t => t.InputTokens ?? 0);
        var periodOutputTokens = periodTokens.Sum(t => t.OutputTokens ?? 0);

        return Ok(new OverviewStats(
            totalAgents, runningTasks, periodTasks,
            periodInputTokens, periodOutputTokens));
    }

    [HttpGet("agents")]

    public async Task<IActionResult> AgentUsage([FromQuery] DateTime? startDate = null, [FromQuery] DateTime? endDate = null)
    {
        var start = startDate?.Date ?? DateTime.UtcNow.Date;
        var end = endDate?.Date.AddDays(1) ?? start.AddDays(1);

        var stats = await db.Tasks
            .Where(t => t.CreatedAt >= start && t.CreatedAt < end)
            .GroupBy(t => t.AgentId)
            .Select(g => new
            {
                AgentId = g.Key,
                TaskCount = g.Count(),
                InputTokens = g.Sum(t => t.InputTokens ?? 0),
                OutputTokens = g.Sum(t => t.OutputTokens ?? 0)
            })
            .ToListAsync();

        var agentIds = stats.Select(s => s.AgentId).ToList();
        var agents = await db.Agents.Where(a => agentIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, a => a.Name);

        var result = stats.Select(s => new AgentUsageDto(
            s.AgentId,
            agents.TryGetValue(s.AgentId, out var name) ? name : "Unknown",
            s.TaskCount,
            s.InputTokens,
            s.OutputTokens,
            s.InputTokens + s.OutputTokens
        ))
        .OrderByDescending(s => s.TotalTokens)
        .ToList();

        return Ok(result);
    }

    [HttpGet("tokens")]
    public async Task<IActionResult> TokenStats([FromQuery] Guid? agentId, [FromQuery] int days = 7)
    {
        var since = DateTime.UtcNow.AddDays(-days);
        var query = db.Tasks.Where(t => t.CreatedAt >= since);
        if (agentId.HasValue)
            query = query.Where(t => t.AgentId == agentId.Value);

        var data = await query
            .GroupBy(t => t.CreatedAt.Date)
            .Select(g => new
            {
                Date = g.Key,
                InputTokens = g.Sum(t => t.InputTokens ?? 0),
                OutputTokens = g.Sum(t => t.OutputTokens ?? 0),
                Tasks = g.Count()
            })
            .OrderBy(g => g.Date)
            .ToListAsync();

        return Ok(data);
    }

    [HttpPost("validate-directory")]
    public IActionResult ValidateDirectory([FromBody] ValidateDirectoryRequest req)
    {
        return Ok(new { exists = Directory.Exists(req.Path) });
    }
}

public record ValidateDirectoryRequest(string Path);
