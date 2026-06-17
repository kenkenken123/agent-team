using AgentTeam.Api.Data;
using AgentTeam.Api.DTOs;
using AgentTeam.Api.Models;
using AgentTeam.Api.Services;
using AgentTeam.Api.Saas.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace AgentTeam.Api.Saas.Controllers;

[Authorize]
[ApiController]
[Route("api/saas/tasks")]
public class SaasTasksController(
    AppDbContext db,
    ClaudeCodeService claudeService,
    OutputFileService outputFileService,
    MessageRouterService router) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? agentId, [FromQuery] string? status, [FromQuery] string? sessionId, [FromQuery] int skip = 0, [FromQuery] int take = 5)
    {
        try
        {
            var userId = GetUserId();
            var query = db.Tasks.Include(t => t.Agent).Where(t => t.Agent.SaasUserId == userId);

            if (agentId.HasValue)
                query = query.Where(t => t.AgentId == agentId.Value);

            if (!string.IsNullOrEmpty(status) && Enum.TryParse<AgentTeam.Api.Models.TaskStatus>(status, true, out var s))
                query = query.Where(t => t.Status == s);

            if (!string.IsNullOrEmpty(sessionId))
                query = query.Where(t => t.ClaudeSessionId != null && t.ClaudeSessionId.Contains(sessionId));

            var total = await query.CountAsync();

            var tempDir = SaasPathHelper.ResolveSafe(userId, ".temp");
            Dictionary<string, string> titles = new();
            var titlesFile = Path.Combine(tempDir, "session_titles.json");
            if (System.IO.File.Exists(titlesFile))
            {
                try
                {
                    var content = await System.IO.File.ReadAllTextAsync(titlesFile);
                    titles = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(content) ?? new();
                }
                catch {}
            }

            Dictionary<string, string> dirs = new();
            var dirsFile = Path.Combine(tempDir, "session_dirs.json");
            if (System.IO.File.Exists(dirsFile))
            {
                try
                {
                    var content = await System.IO.File.ReadAllTextAsync(dirsFile);
                    dirs = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(content) ?? new();
                }
                catch {}
            }

            var tasks = await query
                .OrderByDescending(t => t.CreatedAt)
                .Skip(skip)
                .Take(take)
                .ToListAsync();

            var taskDtos = tasks.Select(t => ToDto(t, titles, dirs)).ToList();
            return Ok(new { items = taskDtos, total });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var task = await db.Tasks.Include(t => t.Agent).FirstOrDefaultAsync(t => t.Id == id && t.Agent.SaasUserId == userId);
            if (task == null) return NotFound();

            var tempDir = SaasPathHelper.ResolveSafe(userId, ".temp");
            Dictionary<string, string> titles = new();
            var titlesFile = Path.Combine(tempDir, "session_titles.json");
            if (System.IO.File.Exists(titlesFile))
            {
                try
                {
                    var content = await System.IO.File.ReadAllTextAsync(titlesFile);
                    titles = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(content) ?? new();
                }
                catch {}
            }

            Dictionary<string, string> dirs = new();
            var dirsFile = Path.Combine(tempDir, "session_dirs.json");
            if (System.IO.File.Exists(dirsFile))
            {
                try
                {
                    var content = await System.IO.File.ReadAllTextAsync(dirsFile);
                    dirs = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(content) ?? new();
                }
                catch {}
            }

            return Ok(ToDto(task, titles, dirs));
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTaskRequest req)
    {
        try
        {
            var userId = GetUserId();
            var prompt = req.Prompt;
            var agentId = req.AgentId;

            if (!agentId.HasValue) return BadRequest(new { error = "未选择 Agent" });

            var agent = await db.Agents.Include(a => a.Template).FirstOrDefaultAsync(a => a.Id == agentId.Value && a.SaasUserId == userId);
            if (agent == null) return BadRequest(new { error = "Agent 不存在或无权访问" });
            if (!agent.IsEnabled) return BadRequest(new { error = "Agent 已被禁用" });

            var relativePath = req.WorkingDirectory;

            if (string.IsNullOrEmpty(relativePath))
            {
                string? sId = null;
                if (!req.ForceNewSession)
                {
                    sId = req.ResumeSessionId;
                    if (sId == null)
                    {
                        var lastTask = await db.Tasks
                            .Where(t => t.AgentId == agentId.Value && t.ClaudeSessionId != null)
                            .OrderByDescending(t => t.CreatedAt)
                            .FirstOrDefaultAsync();
                        sId = lastTask?.ClaudeSessionId;
                    }
                }

                if (!string.IsNullOrEmpty(sId))
                {
                    var tempDir = SaasPathHelper.ResolveSafe(userId, ".temp");
                    var dirsFile = Path.Combine(tempDir, "session_dirs.json");
                    if (System.IO.File.Exists(dirsFile))
                    {
                        try
                        {
                            var content = await System.IO.File.ReadAllTextAsync(dirsFile);
                            var dirs = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(content);
                            if (dirs != null && dirs.TryGetValue(sId, out var savedDir))
                            {
                                relativePath = savedDir;
                            }
                        }
                        catch {}
                    }
                }
            }

            relativePath ??= "";
            var safePhysicalPath = SaasPathHelper.ResolveSafe(userId, relativePath);

            if (req.OptimizePrompt)
            {
                prompt = await router.OptimizePromptAsync(prompt, agentId);
            }

            if (req.PlanMode)
            {
                prompt += "\n\n注意: 当前处于分析模式。请分析并给出执行步骤，禁止执行任何文件写入或系统修改操作。";
            }

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

            var task = new AgentTask
            {
                AgentId = agentId.Value,
                Agent = agent,
                Prompt = req.Prompt,
                OptimizedPrompt = prompt != req.Prompt ? prompt : null,
                ClaudeSessionId = sessionId,
                TerminalType = req.TerminalType,
                WorkingDirectory = safePhysicalPath,
                Model = req.Model,
                UsePlatformConfig = !string.IsNullOrEmpty(req.Model),
                IsPlanMode = req.PlanMode
            };

            agent.LastUsedAt = DateTime.UtcNow;
            db.Tasks.Add(task);
            await db.SaveChangesAsync();

            _ = claudeService.StartTaskAsync(task, agent);

            return CreatedAtAction(nameof(GetById), new { id = task.Id }, ToDto(task));
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var task = await db.Tasks.Include(t => t.Agent).FirstOrDefaultAsync(t => t.Id == id && t.Agent.SaasUserId == userId);
            if (task == null) return NotFound();
            if (task.Status != AgentTeam.Api.Models.TaskStatus.Running)
                return BadRequest(new { error = "任务不在运行中" });

            var success = await claudeService.CancelTaskAsync(id);
            return success ? Ok(new { message = "任务已取消" }) : StatusCode(500, new { error = "取消失败" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var task = await db.Tasks.Include(t => t.Agent).FirstOrDefaultAsync(t => t.Id == id && t.Agent.SaasUserId == userId);
            if (task == null) return NotFound();

            if (task.Status == AgentTeam.Api.Models.TaskStatus.Running)
            {
                await claudeService.CancelTaskAsync(id);
                await Task.Delay(200);
            }

            outputFileService.Delete(id);
            db.Tasks.Remove(task);
            await db.SaveChangesAsync();

            return Ok(new { message = "删除任务成功" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("session")]
    public async Task<IActionResult> DeleteSession([FromQuery] string? sessionId, [FromQuery] Guid? taskId)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(sessionId) && (!taskId.HasValue))
                return BadRequest(new { error = "必须提供 sessionId 或 taskId" });

            List<AgentTask> tasksToDelete;
            if (!string.IsNullOrEmpty(sessionId))
            {
                tasksToDelete = await db.Tasks.Include(t => t.Agent)
                    .Where(t => t.ClaudeSessionId == sessionId && t.Agent.SaasUserId == userId)
                    .ToListAsync();
            }
            else
            {
                tasksToDelete = await db.Tasks.Include(t => t.Agent)
                    .Where(t => t.Id == taskId && t.ClaudeSessionId == null && t.Agent.SaasUserId == userId)
                    .ToListAsync();
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
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("{id:guid}/output")]
    public async Task<IActionResult> GetOutput(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var task = await db.Tasks.Include(t => t.Agent).FirstOrDefaultAsync(t => t.Id == id && t.Agent.SaasUserId == userId);
            if (task == null) return NotFound();
            var content = await outputFileService.ReadAsync(id);
            return Ok(new { content });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private Guid GetUserId()
    {
        var nameIdentifier = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(nameIdentifier) || !Guid.TryParse(nameIdentifier, out var userId))
        {
            throw new UnauthorizedAccessException("未登录或 Token 无效。");
        }
        return userId;
    }

    [HttpPut("session/{sessionId}/title")]
    public async Task<IActionResult> UpdateSessionTitle(string sessionId, [FromBody] UpdateSessionTitleRequest req)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(sessionId)) return BadRequest(new { error = "会话 ID 不能为空" });
            if (string.IsNullOrEmpty(req.Title)) return BadRequest(new { error = "标题不能为空" });

            var tempDir = SaasPathHelper.ResolveSafe(userId, ".temp");
            if (!Directory.Exists(tempDir))
            {
                Directory.CreateDirectory(tempDir);
            }

            var filePath = Path.Combine(tempDir, "session_titles.json");
            Dictionary<string, string> titles = new();
            if (System.IO.File.Exists(filePath))
            {
                try
                {
                    var content = await System.IO.File.ReadAllTextAsync(filePath);
                    titles = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(content) ?? new();
                }
                catch {}
            }

            titles[sessionId] = req.Title;
            var json = System.Text.Json.JsonSerializer.Serialize(titles, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            await System.IO.File.WriteAllTextAsync(filePath, json);

            return Ok(new { message = "标题修改成功", sessionId, title = req.Title });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("session/{sessionId}/working-dir")]
    public async Task<IActionResult> UpdateSessionDir(string sessionId, [FromBody] UpdateSessionDirRequest req)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(sessionId)) return BadRequest(new { error = "会话 ID 不能为空" });

            var tempDir = SaasPathHelper.ResolveSafe(userId, ".temp");
            if (!Directory.Exists(tempDir))
            {
                Directory.CreateDirectory(tempDir);
            }

            var filePath = Path.Combine(tempDir, "session_dirs.json");
            Dictionary<string, string> dirs = new();
            if (System.IO.File.Exists(filePath))
            {
                try
                {
                    var content = await System.IO.File.ReadAllTextAsync(filePath);
                    dirs = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(content) ?? new();
                }
                catch {}
            }

            dirs[sessionId] = req.WorkingDir ?? "";
            var json = System.Text.Json.JsonSerializer.Serialize(dirs, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            await System.IO.File.WriteAllTextAsync(filePath, json);

            return Ok(new { message = "会话启动目录更新成功", sessionId, workingDir = req.WorkingDir });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private static TaskDto ToDto(AgentTask t, Dictionary<string, string>? titles = null, Dictionary<string, string>? dirs = null)
    {
        string? sessionTitle = null;
        if (t.ClaudeSessionId != null && titles != null)
        {
            titles.TryGetValue(t.ClaudeSessionId, out sessionTitle);
        }

        string? sessionDir = null;
        if (t.ClaudeSessionId != null && dirs != null)
        {
            dirs.TryGetValue(t.ClaudeSessionId, out sessionDir);
        }

        if (string.IsNullOrEmpty(sessionDir) && !string.IsNullOrEmpty(t.WorkingDirectory))
        {
            var userId = t.Agent?.SaasUserId;
            if (userId.HasValue)
            {
                sessionDir = SaasPathHelper.GetRelativePath(userId.Value, t.WorkingDirectory);
            }
        }

        return new(
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
            t.MarkedForDeletionAt,
            sessionTitle,
            sessionDir
        );
    }
}
