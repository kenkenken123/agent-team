using AgentTeam.Api.Data;
using AgentTeam.Api.DTOs;
using AgentTeam.Api.Models;
using AgentTeam.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/tasks")]
public class TasksController(
    AppDbContext db,
    ClaudeCodeService claudeService,
    OutputFileService outputFileService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? agentId, [FromQuery] string? status)
    {
        var query = db.Tasks.Include(t => t.Agent).AsQueryable();

        if (agentId.HasValue)
            query = query.Where(t => t.AgentId == agentId.Value);

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<AgentTeam.Api.Models.TaskStatus>(status, true, out var s))
            query = query.Where(t => t.Status == s);

        var tasks = await query
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => ToDto(t))
            .ToListAsync();

        return Ok(tasks);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var task = await db.Tasks.Include(t => t.Agent).FirstOrDefaultAsync(t => t.Id == id);
        if (task == null) return NotFound();
        return Ok(ToDto(task));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTaskRequest req)
    {
        var agent = await db.Agents.FindAsync(req.AgentId);
        if (agent == null) return BadRequest(new { error = "Agent 不存在" });
        if (!agent.IsEnabled) return BadRequest(new { error = "Agent 已被禁用" });

        // 获取要使用的 SessionId（优先用请求中指定的，其次用 Agent 最后一次任务的）
        string? sessionId = req.ResumeSessionId;
        if (sessionId == null)
        {
            var lastTask = await db.Tasks
                .Where(t => t.AgentId == req.AgentId && t.ClaudeSessionId != null)
                .OrderByDescending(t => t.CreatedAt)
                .FirstOrDefaultAsync();
            sessionId = lastTask?.ClaudeSessionId;
        }

        var task = new AgentTask
        {
            AgentId = req.AgentId,
            Agent = agent,
            Prompt = req.Prompt,
            ClaudeSessionId = sessionId,
            TerminalType = req.TerminalType
        };

        db.Tasks.Add(task);
        await db.SaveChangesAsync();

        // 异步启动进程（不阻塞HTTP响应）
        _ = claudeService.StartTaskAsync(task, agent);

        return CreatedAtAction(nameof(GetById), new { id = task.Id }, ToDto(task));
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var task = await db.Tasks.FindAsync(id);
        if (task == null) return NotFound();
        if (task.Status != AgentTeam.Api.Models.TaskStatus.Running)
            return BadRequest(new { error = "任务不在运行中" });

        var success = await claudeService.CancelTaskAsync(id);
        return success ? Ok(new { message = "任务已取消" }) : StatusCode(500, new { error = "取消失败" });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var task = await db.Tasks.FindAsync(id);
        if (task == null) return NotFound();
        
        // 如果任务在运行中，先尝试取消它
        if (task.Status == AgentTeam.Api.Models.TaskStatus.Running)
        {
            await claudeService.CancelTaskAsync(id);
        }

        // 删除磁盘日志文件
        outputFileService.Delete(id);

        db.Tasks.Remove(task);
        await db.SaveChangesAsync();

        return Ok(new { message = "删除成功" });
    }


    [HttpGet("{id:guid}/output")]

    public async Task<IActionResult> GetOutput(Guid id)
    {
        var task = await db.Tasks.FindAsync(id);
        if (task == null) return NotFound();
        var content = await outputFileService.ReadAsync(id);
        return Ok(new { content });
    }

    private static TaskDto ToDto(AgentTask t) => new(
        t.Id,
        t.AgentId,
        t.Agent?.Name ?? "",
        t.Prompt,
        t.Status.ToString(),
        t.ClaudeSessionId,
        t.TerminalType,
        t.TokensUsed,
        t.InputTokens,
        t.OutputTokens,
        t.StartedAt,
        t.CompletedAt,
        t.ExitCode,
        t.CreatedAt
    );
}
