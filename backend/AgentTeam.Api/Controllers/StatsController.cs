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
    public async Task<IActionResult> Overview([FromQuery] DateTime? date = null)
    {
        var targetDate = date?.Date ?? DateTime.UtcNow.Date;
        var nextDay = targetDate.AddDays(1);

        var totalAgents = await db.Agents.CountAsync(a => a.IsEnabled);
        var runningTasks = await db.Tasks.CountAsync(t =>
            t.Status == AgentTeam.Api.Models.TaskStatus.Running);
        var todayTasks = await db.Tasks.CountAsync(t => t.CreatedAt >= targetDate && t.CreatedAt < nextDay);

        var todayTokens = await db.Tasks
            .Where(t => t.CreatedAt >= targetDate && t.CreatedAt < nextDay)
            .Select(t => new { t.InputTokens, t.OutputTokens })
            .ToListAsync();

        var todayInputTokens = todayTokens.Sum(t => t.InputTokens ?? 0);
        var todayOutputTokens = todayTokens.Sum(t => t.OutputTokens ?? 0);

        return Ok(new OverviewStats(
            totalAgents, runningTasks, todayTasks,
            todayInputTokens, todayOutputTokens));
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
