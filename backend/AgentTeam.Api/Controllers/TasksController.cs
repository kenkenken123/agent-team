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
    OutputFileService outputFileService,
    MessageRouterService router) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? agentId, [FromQuery] string? status, [FromQuery] string? sessionId, [FromQuery] int skip = 0, [FromQuery] int take = 5)
    {
        var query = db.Tasks.Include(t => t.Agent).AsQueryable();

        if (agentId.HasValue)
            query = query.Where(t => t.AgentId == agentId.Value);

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<AgentTeam.Api.Models.TaskStatus>(status, true, out var s))
            query = query.Where(t => t.Status == s);

        if (!string.IsNullOrEmpty(sessionId))
            query = query.Where(t => t.ClaudeSessionId != null && t.ClaudeSessionId.Contains(sessionId));

        var total = await query.CountAsync();

        var tasks = await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip(skip)
            .Take(take)
            .Select(t => ToDto(t))
            .ToListAsync();

        return Ok(new { items = tasks, total });
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
        var prompt = req.Prompt;
        var agentId = req.AgentId;
        var workingDirectory = req.WorkingDirectory;

        // 1. 自动识别 Agent
        if (req.AutoIdentifyAgent)
        {
            var routingResult = await router.RouteMessageAsync(prompt);
            if (routingResult.agentId.HasValue)
            {
                agentId = routingResult.agentId.Value;
                if (string.IsNullOrEmpty(workingDirectory))
                {
                    workingDirectory = routingResult.extractedPath;
                }
            }
        }

        if (!agentId.HasValue) return BadRequest(new { error = "未选择 Agent 且自动识别失败" });

        var agent = await db.Agents.Include(a => a.Template).FirstOrDefaultAsync(a => a.Id == agentId.Value);
        if (agent == null) return BadRequest(new { error = "Agent 不存在" });
        if (!agent.IsEnabled) return BadRequest(new { error = "Agent 已被禁用" });

        // 2. 优化 Prompt
        if (req.OptimizePrompt)
        {
            prompt = await router.OptimizePromptAsync(prompt, agentId);
        }

        // 3. Plan 模式下追加禁止执行提示
        if (req.PlanMode)
        {
            prompt += "\n\n注意: 当前处于分析模式。请分析并给出执行步骤，禁止执行任何文件写入或系统修改操作。";
        }

        // 获取要使用的 SessionId
        string? sessionId = null;
        if (!req.ForceNewSession)
        {
            sessionId = req.ResumeSessionId;
            if (sessionId == null)
            {
                var lastTask = await db.Tasks
                    .Where(t => t.AgentId == agentId.Value && t.ClaudeSessionId != null)
                    .OrderByDescending(t => t.CreatedAt)
                    .FirstOrDefaultAsync();
                sessionId = lastTask?.ClaudeSessionId;
            }
        }

        workingDirectory ??= agent.WorkingDirectory;
        if (string.IsNullOrEmpty(workingDirectory))
            return BadRequest(new { error = "未指定工作目录，且该 Agent 未设置固定目录" });

        var task = new AgentTask
        {
            AgentId = agentId.Value,
            Agent = agent,
            Prompt = req.Prompt,
            OptimizedPrompt = prompt != req.Prompt ? prompt : null,
            ClaudeSessionId = sessionId,
            TerminalType = req.TerminalType,
            WorkingDirectory = workingDirectory,
            Model = req.Model, // 仅当请求显式指定时才设置
            UsePlatformConfig = !string.IsNullOrEmpty(req.Model), // 显式指定 model 时才使用平台配置
            IsPlanMode = req.PlanMode
        };

        agent.LastUsedAt = DateTime.UtcNow;
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
            // 给进程释放文件留一点时间
            await Task.Delay(200);
        }

        // 删除磁盘日志文件
        outputFileService.Delete(id);

        db.Tasks.Remove(task);
        await db.SaveChangesAsync();

        return Ok(new { message = "删除任务成功" });
    }

    [HttpDelete("session")]
    public async Task<IActionResult> DeleteSession([FromQuery] string? sessionId, [FromQuery] Guid? taskId)
    {
        if (string.IsNullOrEmpty(sessionId) && (!taskId.HasValue))
            return BadRequest(new { error = "必须提供 sessionId 或 taskId" });

        List<AgentTask> tasksToDelete;
        if (!string.IsNullOrEmpty(sessionId))
        {
            tasksToDelete = await db.Tasks.Where(t => t.ClaudeSessionId == sessionId).ToListAsync();
        }
        else
        {
            tasksToDelete = await db.Tasks.Where(t => t.Id == taskId && t.ClaudeSessionId == null).ToListAsync();
        }

        foreach (var task in tasksToDelete)
        {
            if (task.Status == AgentTeam.Api.Models.TaskStatus.Running)
            {
                await claudeService.CancelTaskAsync(task.Id);
            }
            outputFileService.Delete(task.Id);
            db.Tasks.Remove(task);
        }

        await db.SaveChangesAsync();
        return Ok(new { message = "会话已删除", count = tasksToDelete.Count });
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
        t.WorkingDirectory,
        t.Prompt,
        t.Status.ToString(),
        t.ClaudeSessionId,
        t.TerminalType,
        t.TokensUsed,
        t.InputTokens,
        t.OutputTokens,
        t.CacheReadTokens,
        t.CacheCreationTokens,
        t.RequestCount,
        t.Model,
        t.IsPlanMode,
        t.FinalResult,
        t.ButlerSummary,
        t.OptimizedPrompt,
        t.StartedAt,
        t.CompletedAt,
        t.ExitCode,
        t.CreatedAt,
        t.MarkedForDeletionAt
    );
}
