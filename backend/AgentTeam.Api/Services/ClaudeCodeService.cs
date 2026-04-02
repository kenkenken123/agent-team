using System.Text.Json;
using System.Text.RegularExpressions;
using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace AgentTeam.Api.Services;

/// <summary>
/// Claude Code 进程管理核心服务
/// </summary>
public class ClaudeCodeService(
    IServiceScopeFactory scopeFactory,
    OutputFileService outputFileService,
    ILogger<ClaudeCodeService> logger)
{
    // 保存运行中的进程 taskId -> Process
    private readonly Dictionary<Guid, System.Diagnostics.Process> _runningProcesses = [];
    private readonly Lock _lock = new();

    // WebSocket 推送委托：外部订阅后可实时接收输出
    public event Func<Guid, string, Task>? OnOutput;
    public event Func<Guid, string, Task>? OnStatusChanged;

    /// <summary>启动 Claude Code 子进程执行任务</summary>
    public async Task StartTaskAsync(AgentTask task, Agent agent)
    {
        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            // 更新任务状态
            var t = await db.Tasks.FindAsync(task.Id);
            if (t != null)
            {
                t.Status = Models.TaskStatus.Running;
                t.StartedAt = DateTime.UtcNow;

                // 准备输出文件
                var outputPath = outputFileService.GetOutputPath(task.Id);
                t.OutputFilePath = outputPath;

                await db.SaveChangesAsync();
                await NotifyStatusAsync(task.Id, "Running");

                try
                {
                    // 开始执行
                    await ExecuteProcessAsync(t, agent, outputPath);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "[Task {TaskId}] 执行过程中抛出未捕获异常", task.Id);
                }

            }
        }
    }

    private async Task ExecuteProcessAsync(AgentTask task, Agent agent, string outputPath)
    {
        // 构建命令
        var (fileName, arguments) = BuildCommand(task, agent);
        logger.LogInformation("启动任务 {TaskId}，命令: {FileName} {Arguments}", task.Id, fileName, arguments);

        var process = new System.Diagnostics.Process
        {
            StartInfo = new System.Diagnostics.ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = agent.WorkingDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            },
            EnableRaisingEvents = true
        };

        try
        {
            process.Start();
            logger.LogInformation("进程成功启动，PID: {Pid}", process.Id);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "进程启动失败! 路径: {FileName}, 错误: {Message}", fileName, ex.Message);
            await NotifyOutputAsync(task.Id, $"\x1b[31m[系统错误] 无法启动进程 'claude'. 请检查命令是否已安装并加入 PATH。\r\n错误原因: {ex.Message}\x1b[0m\r\n");
            await NotifyStatusAsync(task.Id, "Failed");

            using var errorScope = scopeFactory.CreateScope();
            var db = errorScope.ServiceProvider.GetRequiredService<AppDbContext>();
            var errorTask = await db.Tasks.FindAsync(task.Id);
            if (errorTask != null)
            {
                errorTask.Status = Models.TaskStatus.Failed;
                errorTask.CompletedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
            return;
        }

        // 并行读取 stdout 和 stderr
        var stdoutTask = ReadStreamAsync(process.StandardOutput, task.Id, outputPath, isError: false);
        var stderrTask = ReadStreamAsync(process.StandardError, task.Id, outputPath, isError: true);

        // 关键：将进程加入运行中集合，否则 Cancel 找不到
        lock (_lock) { _runningProcesses[task.Id] = process; }

        // 等待进程结束
        _ = Task.Run(async () =>
        {
            await Task.WhenAll(stdoutTask, stderrTask);
            await process.WaitForExitAsync();

            var exitCode = process.ExitCode;

            // 更新任务状态
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var freshTask = await db.Tasks.FindAsync(task.Id);
            if (freshTask != null)
            {
                freshTask.ExitCode = exitCode;
                freshTask.CompletedAt = DateTime.UtcNow;
                freshTask.Status = exitCode == 0 ? Models.TaskStatus.Completed : Models.TaskStatus.Failed;
                await db.SaveChangesAsync();
            }

            lock (_lock) { _runningProcesses.Remove(task.Id); }

            var statusStr = exitCode == 0 ? "Completed" : "Failed";
            await NotifyStatusAsync(task.Id, statusStr);
            logger.LogInformation("任务 {TaskId} 结束，退出码: {ExitCode}", task.Id, exitCode);
        });
    }

    /// <summary>取消运行中的任务</summary>
    public async Task<bool> CancelTaskAsync(Guid taskId)
    {
        System.Diagnostics.Process? process;
        lock (_lock)
        {
            _runningProcesses.TryGetValue(taskId, out process);
        }

        if (process == null) return false;

        try
        {
            process.Kill(entireProcessTree: true);

            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var task = await db.Tasks.FindAsync(taskId);
            if (task != null)
            {
                task.Status = Models.TaskStatus.Cancelled;
                task.CompletedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
            await NotifyStatusAsync(taskId, "Cancelled");
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "取消任务 {TaskId} 失败", taskId);
            return false;
        }
    }

    public bool IsRunning(Guid taskId)
    {
        lock (_lock) { return _runningProcesses.ContainsKey(taskId); }
    }

    // ─── 内部方法 ─────────────────────────────────────────────

    private (string fileName, string arguments) BuildCommand(AgentTask task, Agent agent)
    {
        var args = new System.Text.StringBuilder();

        if (!string.IsNullOrEmpty(task.ClaudeSessionId))
        {
            // 恢复上下文
            args.Append($"--resume {task.ClaudeSessionId} ");
        }

        // 无论是否恢复，都应该尝试应用该任务指定的模型和配置
        // 注意：--print 必须加上以防陷入交互模式
        args.Append("--print ");
        
        var effectiveModel = task.Model ?? agent.Model;
        if (!string.IsNullOrEmpty(effectiveModel))
            args.Append($"--model {effectiveModel} ");

        if (agent.Template != null && !string.IsNullOrWhiteSpace(agent.Template.SystemPrompt))
        {
            var escapedPrompt = agent.Template.SystemPrompt.Replace("\"", "\\\"");
            args.Append($"--system-prompt \"{escapedPrompt}\" ");
        }

        if (agent.MaxTurns.HasValue)
            args.Append($"--max-turns {agent.MaxTurns} ");

        // 追加 --output-format stream-json --verbose 以便解析流式的事件与 session_id
        args.Append("--output-format stream-json --verbose ");

        var escapedUserPrompt = task.Prompt.Replace("\"", "\\\"");
        args.Append($"\"{escapedUserPrompt}\"");

        var executable = System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows)
            ? "claude.cmd"
            : "claude";

        return (executable, args.ToString().TrimEnd());
    }


    private async Task ReadStreamAsync(
        System.IO.StreamReader reader,
        Guid taskId,
        string outputPath,
        bool isError)
    {
        while (await reader.ReadLineAsync() is { } line)
        {
            logger.LogInformation("[Task {TaskId}] Received: {Line}", taskId, line);

            // 尝试解析 JSON 提取 session_id 和 token，以及需要展示的文本
            bool isJson = TryParseClaudeJson(line, taskId, out var extractedText);

            string display;
            if (isJson)
            {
                // 如果是 JSON 但是没有 extractedText (比如只有使用量统计等内部报文)，则不输出到终端
                if (string.IsNullOrEmpty(extractedText)) continue;
                // 添加换行符
                if (!extractedText.EndsWith("\n")) extractedText += "\r\n";
                display = extractedText;
            }
            else
            {
                // 前缀标识流类型
                display = isError ? $"\x1b[31m{line}\x1b[0m\r\n" : $"{line}\r\n";
            }

            // 写入文件
            await outputFileService.AppendAsync(outputPath, display);

            // 广播到 WebSocket
            await NotifyOutputAsync(taskId, display);
        }

    }

    private bool TryParseClaudeJson(string line, Guid taskId, out string? extractedText)
    {
        extractedText = null;
        var trimmed = line.TrimStart();
        if (!trimmed.StartsWith('{')) return false;
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;

            // ===== 提取 usage / token 统计 =====
            JsonElement? usageEl = null;
            if (root.TryGetProperty("usage", out var u1)) usageEl = u1;
            else if (root.TryGetProperty("message", out var m) && m.TryGetProperty("usage", out var u2)) usageEl = u2;

            if (usageEl.HasValue)
            {
                int inputTokens = 0, outputTokens = 0;
                if (usageEl.Value.ValueKind == JsonValueKind.Object)
                {
                    if (usageEl.Value.TryGetProperty("input_tokens", out var inEl) && inEl.ValueKind == JsonValueKind.Number)
                        inputTokens = inEl.GetInt32();
                    if (usageEl.Value.TryGetProperty("output_tokens", out var outEl) && outEl.ValueKind == JsonValueKind.Number)
                        outputTokens = outEl.GetInt32();

                    if (inputTokens > 0 || outputTokens > 0)
                    {
                        _ = Task.Run(async () =>
                        {
                            using var scope = scopeFactory.CreateScope();
                            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                            var t = await db.Tasks.FindAsync(taskId);
                            if (t != null)
                            {
                                t.InputTokens = (t.InputTokens ?? 0) + inputTokens;
                                t.OutputTokens = (t.OutputTokens ?? 0) + outputTokens;
                                t.TokensUsed = t.InputTokens + t.OutputTokens;
                                await db.SaveChangesAsync();
                            }
                        });
                    }
                }
            }

            // ===== 实时流模式 (stream-json) 处理 =====
            if (root.TryGetProperty("type", out var typeEl))
            {
                var type = typeEl.GetString();
                if (type == "assistant" && root.TryGetProperty("message", out var msgEl))
                {
                    if (msgEl.TryGetProperty("type", out var msgTypeEl))
                    {
                        var msgType = msgTypeEl.GetString();
                        if (msgType == "message" && msgEl.TryGetProperty("content", out var contentList) && contentList.ValueKind == JsonValueKind.Array)
                        {
                            var sb = new System.Text.StringBuilder();
                            foreach (var item in contentList.EnumerateArray())
                            {
                                if (item.TryGetProperty("type", out var itemTypeEl))
                                {
                                    var itemType = itemTypeEl.GetString();
                                    if (itemType == "text" && item.TryGetProperty("text", out var textEl))
                                    {
                                        sb.Append(textEl.GetString());
                                    }
                                    else if (itemType == "tool_use" && item.TryGetProperty("name", out var nameEl))
                                    {
                                        var toolName = nameEl.GetString();
                                        var detail = string.Empty;
                                        if (item.TryGetProperty("input", out var inputEl))
                                        {
                                            if (toolName == "Grep" || toolName == "grep_search")
                                                detail = inputEl.TryGetProperty("query", out var query) ? $": {query.GetString()}" : "";
                                            else if (toolName == "Bash" || toolName == "run_command")
                                                detail = inputEl.TryGetProperty("command", out var cmd) ? $": {cmd.GetString()}" : "";
                                            else if (toolName == "Read" || toolName == "view_file")
                                                detail = inputEl.TryGetProperty("path", out var path) ? $": {Path.GetFileName(path.GetString())}" : "";
                                            else if (toolName == "Write" || toolName == "write_to_file")
                                                detail = inputEl.TryGetProperty("path", out var wpath) ? $": {Path.GetFileName(wpath.GetString())}" : "";
                                        }
                                        sb.Append($"\r\n\x1b[36m[Claude 正在调用工具: {toolName}{detail}]\x1b[0m\r\n");
                                    }
                                    else if (itemType == "thinking" && item.TryGetProperty("thinking", out var thinkingEl))
                                    {
                                        // 思考过程以灰色显示
                                        sb.Append($"\x1b[90m[思考: {thinkingEl.GetString()}]\x1b[0m\r\n");
                                    }
                                }
                            }
                            extractedText = sb.ToString();
                            if (string.IsNullOrEmpty(extractedText))
                            {
                                extractedText = null;
                            }
                        }
                    }
                }
                else if (type == "system" && root.TryGetProperty("subtype", out var subtypeEl))
                {
                    var subtype = subtypeEl.GetString();
                    if (subtype == "init" && root.TryGetProperty("session_id", out var sidEl))
                    {
                        var sessionId = sidEl.GetString();
                        if (!string.IsNullOrEmpty(sessionId))
                        {
                            _ = Task.Run(async () =>
                            {
                                using var scope = scopeFactory.CreateScope();
                                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                                var t = await db.Tasks.FindAsync(taskId);
                                if (t != null && t.ClaudeSessionId != sessionId)
                                {
                                    t.ClaudeSessionId = sessionId;
                                    await db.SaveChangesAsync();
                                }
                            });
                        }
                    }
                }
                else if (type == "result" && root.TryGetProperty("subtype", out var resSubtypeEl) && resSubtypeEl.GetString() == "success")
                {
                    extractedText = "\x1b[32m[回合执行完成]\x1b[0m\r\n";
                }
                return true;
            }

            // ===== 兼容老版普通 json 输出模式 =====
            // 提取 session_id
            if (root.TryGetProperty("session_id", out var oldSessionIdEl))
            {
                var sessionId = oldSessionIdEl.GetString();
                if (!string.IsNullOrEmpty(sessionId))
                {
                    _ = Task.Run(async () =>
                    {
                        using var scope = scopeFactory.CreateScope();
                        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                        var t = await db.Tasks.FindAsync(taskId);
                        if (t != null && t.ClaudeSessionId != sessionId)
                        {
                            t.ClaudeSessionId = sessionId;
                            await db.SaveChangesAsync();
                        }
                    });
                }
            }


            
            // 提取 result 输出给前端
            if (root.TryGetProperty("result", out var resultEl) && resultEl.ValueKind == JsonValueKind.String)
            {
                extractedText = resultEl.GetString();
            }
            
            return true;
        }
        catch { return false; }
    }


    private async Task NotifyOutputAsync(Guid taskId, string content)
    {
        if (OnOutput != null)
            await OnOutput.Invoke(taskId, content);
    }

    private async Task NotifyStatusAsync(Guid taskId, string status)
    {
        if (OnStatusChanged != null)
            await OnStatusChanged.Invoke(taskId, status);
    }
}
