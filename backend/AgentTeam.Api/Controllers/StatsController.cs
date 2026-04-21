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

        // 从独立统计表读取期间数据，不受任务删除影响
        var periodStats = await db.TaskStats
            .Where(s => s.CreatedAt >= start && s.CreatedAt < end)
            .ToListAsync();

        var periodTasks = periodStats.Count;
        var periodInputTokens = periodStats.Sum(s => s.InputTokens);
        var periodOutputTokens = periodStats.Sum(s => s.OutputTokens);
        var periodCacheReadTokens = periodStats.Sum(s => s.CacheReadTokens);
        var periodCacheCreationTokens = periodStats.Sum(s => s.CacheCreationTokens);

        return Ok(new OverviewStats(
            totalAgents, runningTasks, periodTasks,
            periodInputTokens, periodOutputTokens,
            periodCacheReadTokens, periodCacheCreationTokens));
    }

    [HttpGet("agents")]
    public async Task<IActionResult> AgentUsage([FromQuery] DateTime? startDate = null, [FromQuery] DateTime? endDate = null)
    {
        var start = startDate?.Date ?? DateTime.UtcNow.Date;
        var end = endDate?.Date.AddDays(1) ?? start.AddDays(1);

        // 从独立统计表聚合，不受任务删除影响
        var stats = await db.TaskStats
            .Where(s => s.CreatedAt >= start && s.CreatedAt < end)
            .GroupBy(s => s.AgentId)
            .Select(g => new
            {
                AgentId = g.Key,
                AgentName = g.First().AgentName,
                TaskCount = g.Count(),
                InputTokens = g.Sum(s => s.InputTokens),
                OutputTokens = g.Sum(s => s.OutputTokens),
                CacheReadTokens = g.Sum(s => s.CacheReadTokens),
                CacheCreationTokens = g.Sum(s => s.CacheCreationTokens)
            })
            .ToListAsync();

        var result = stats.Select(s => new AgentUsageDto(
            s.AgentId,
            s.AgentName,
            s.TaskCount,
            s.InputTokens,
            s.OutputTokens,
            s.CacheReadTokens,
            s.CacheCreationTokens,
            s.InputTokens + s.OutputTokens + s.CacheReadTokens + s.CacheCreationTokens
        ))
        .OrderByDescending(s => s.TotalTokens)
        .ToList();

        return Ok(result);
    }

    [HttpGet("tokens")]
    public async Task<IActionResult> TokenStats([FromQuery] Guid? agentId, [FromQuery] int days = 7)
    {
        var since = DateTime.UtcNow.AddDays(-days);
        var query = db.TaskStats.Where(s => s.CreatedAt >= since);
        if (agentId.HasValue)
            query = query.Where(s => s.AgentId == agentId.Value);

        var data = await query
            .GroupBy(s => s.CreatedAt.Date)
            .Select(g => new
            {
                Date = g.Key,
                InputTokens = g.Sum(s => s.InputTokens),
                OutputTokens = g.Sum(s => s.OutputTokens),
                CacheReadTokens = g.Sum(s => s.CacheReadTokens),
                CacheCreationTokens = g.Sum(s => s.CacheCreationTokens),
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
