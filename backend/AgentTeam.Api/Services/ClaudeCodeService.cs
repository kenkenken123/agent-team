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
    ButlerMemoryService butlerMemoryService,
    ILogger<ClaudeCodeService> logger)
{
    private readonly Dictionary<Guid, System.Diagnostics.Process> _runningProcesses = [];
    private readonly Dictionary<Guid, System.Text.StringBuilder> _lastAssistantMessages = [];
    private readonly Lock _lock = new();

    // WebSocket 推送委托：外部订阅后可实时接收输出
    public event Func<Guid, string, Task>? OnOutput;
    public event Func<Guid, string, Task>? OnStatusChanged;
    public event Func<Guid, string, string, Task>? OnAskUserQuestion; // taskId, question, requestId

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
                    // 仅当使用平台配置时才查找凭证模板并注入环境变量
                    CredentialTemplate? template = null;
                    if (t.UsePlatformConfig)
                    {
                        var config = await db.ModelConfigs
                            .Include(c => c.Template)
                            .FirstOrDefaultAsync(c => c.ModelId == t.Model);

                        template = config?.Template ?? await db.CredentialTemplates.FirstOrDefaultAsync(ct => ct.IsDefault);
                    }
                    else
                    {
                        logger.LogInformation("[Task {TaskId}] 未指定模型参数，跳过平台配置注入，使用系统环境变量启动 Claude Code", task.Id);
                    }

                    // 开始执行
                    await ExecuteProcessAsync(t, agent, outputPath, template);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "[Task {TaskId}] 执行过程中抛出未捕获异常", task.Id);
                }

            }
        }
    }

    /// <summary>
    /// 清理启动时状态为 Running 的任务（解决进程被强杀导致的卡死）
    /// </summary>
    public async Task CleanupStuckTasksAsync()
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var stuckTasks = await db.Tasks
            .Where(t => t.Status == Models.TaskStatus.Running)
            .ToListAsync();

        if (stuckTasks.Count > 0)
        {
            logger.LogInformation("检测到 {Count} 个卡在执行中的任务，正在重置...", stuckTasks.Count);
            foreach (var task in stuckTasks)
            {
                task.Status = Models.TaskStatus.Failed;
                task.CompletedAt = DateTime.UtcNow;
                await NotifyStatusAsync(task.Id, "Failed");
            }
            await db.SaveChangesAsync();
        }
    }

    private async Task ExecuteProcessAsync(AgentTask task, Agent agent, string outputPath, CredentialTemplate? template)
    {
        var fileName = System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows)
            ? "claude.cmd"
            : "claude";

        // 构建命令
        var argsList = BuildCommandList(task, agent);
        logger.LogInformation("启动任务 {TaskId}，命令: {FileName} {Args}", task.Id, fileName, string.Join(" ", argsList));

        var process = new System.Diagnostics.Process
        {
            StartInfo = new System.Diagnostics.ProcessStartInfo
            {
                FileName = fileName,
                WorkingDirectory = task.WorkingDirectory ?? agent.WorkingDirectory,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            },
            EnableRaisingEvents = true
        };

        foreach (var arg in argsList)
        {
            process.StartInfo.ArgumentList.Add(arg);
        }

        // 注入配置的环境变量
        if (template != null)
        {
            var trimmedKey = template.ApiKey.Trim();
            var maskedKey = trimmedKey.Length > 8
                ? trimmedKey.Substring(0, 4) + "..." + trimmedKey.Substring(trimmedKey.Length - 4)
                : "****";
            var baseUrl = template.BaseUrl?.Trim();

            logger.LogInformation("[Task {TaskId}] 注入环境变量: ANTHROPIC_API_KEY={MaskedKey}, ANTHROPIC_BASE_URL={BaseUrl}",
                task.Id, maskedKey, baseUrl ?? "(未设置)");

            process.StartInfo.Environment["ANTHROPIC_API_KEY"] = trimmedKey;
            if (!string.IsNullOrEmpty(baseUrl))
            {
                process.StartInfo.Environment["ANTHROPIC_BASE_URL"] = baseUrl;
            }
        }


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
            try
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

                    // 提取并保存最终结果
                    string? finalMessage = null;
                    lock (_lock)
                    {
                        if (_lastAssistantMessages.TryGetValue(task.Id, out var sb))
                        {
                            finalMessage = sb.ToString();
                            _lastAssistantMessages.Remove(task.Id);
                        }
                    }

                    if (exitCode == 0 && !string.IsNullOrWhiteSpace(finalMessage))
                    {
                        freshTask.FinalResult = finalMessage;
                        await db.SaveChangesAsync();

                        // 触发即时记忆评估
                        _ = Task.Run(async () =>
                        {
                            try
                            {
                                await butlerMemoryService.ImmediateEvaluationAsync(task.Prompt, finalMessage);
                            }
                            catch (Exception ex)
                            {
                                logger.LogError(ex, "[Task {TaskId}] 触发自动即时记忆评估失败", task.Id);
                            }
                        });
                    }
                    else
                    {
                        await db.SaveChangesAsync();
                        // 即使没有最终消息也要清理缓存
                        lock (_lock) { _lastAssistantMessages.Remove(task.Id); }
                    }

                    lock (_lock) { _runningProcesses.Remove(task.Id); }

                    var statusStr = exitCode == 0 ? "Completed" : "Failed";
                    await NotifyStatusAsync(task.Id, statusStr);
                    logger.LogInformation("任务 {TaskId} 结束，退出码: {ExitCode}", task.Id, exitCode);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "[Task {TaskId}] Background processing error", task.Id);
            }
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

            // 主动进行内存清理，防止 _lastAssistantMessages 堆积
            lock (_lock)
            {
                _lastAssistantMessages.Remove(taskId);
            }

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

    /// <summary>发送输入到运行中的任务进程</summary>
    public async Task SendInputAsync(Guid taskId, string input)
    {
        System.Diagnostics.Process? process;
        lock (_lock)
        {
            _runningProcesses.TryGetValue(taskId, out process);
        }

        if (process != null && !process.HasExited)
        {
            try
            {
                logger.LogInformation("[Task {TaskId}] Sending input: {Input}", taskId, input);
                await process.StandardInput.WriteLineAsync(input);
                await process.StandardInput.FlushAsync();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "[Task {TaskId}] Error sending input to process", taskId);
            }
        }
    }

    // ─── 内部方法 ─────────────────────────────────────────────

    private List<string> BuildCommandList(AgentTask task, Agent agent)
    {
        var args = new List<string>();

        if (!string.IsNullOrEmpty(task.ClaudeSessionId))
        {
            args.Add("--resume");
            args.Add(task.ClaudeSessionId);
        }

        args.Add("--print");

        if (task.IsPlanMode)
        {
            args.Add("--permission-mode");
            args.Add("plan");
        }
        else
        {
            args.Add("--dangerously-skip-permissions");
        }

        if (!string.IsNullOrEmpty(task.Model))
        {
            args.Add("--model");
            args.Add(task.Model);
        }

        if (agent.Template != null && !string.IsNullOrWhiteSpace(agent.Template.SystemPrompt))
        {
            args.Add("--system-prompt");
            var sanitizedSystemPrompt = agent.Template.SystemPrompt.Replace("\r\n", " ==>> ").Replace("\n", " ==>> ");
            args.Add(sanitizedSystemPrompt);
        }

        if (agent.MaxTurns.HasValue)
        {
            args.Add("--max-turns");
            args.Add(agent.MaxTurns.ToString()!);
        }

        args.Add("--output-format");
        args.Add("stream-json");
        args.Add("--verbose");

        var finalPrompt = task.Prompt;
        if (!string.IsNullOrEmpty(task.ImageUrls))
        {
            var images = task.ImageUrls.Split(';');
            finalPrompt += "\n[附图: " + string.Join(", ", images) + "]";
        }
        
        // 关键修复：claude-code CLI 在 --print 模式下，若 positional argument 包含换行符
        // 可能会导致参数解析失败（提示 Input must be provided...）。将其替换为分隔符。
        var sanitizedPrompt = finalPrompt.Replace("\r\n", " ==>> ").Replace("\n", " ==>> ");
        args.Add(sanitizedPrompt);

        return args;
    }


    private async Task ReadStreamAsync(
        System.IO.StreamReader reader,
        Guid taskId,
        string outputPath,
        bool isError)
    {
        while (await reader.ReadLineAsync() is { } line)
        {
            // 截取前200个字符，防止输出过长
            var logLine = line.Length > 200 ? line.Substring(0, 200) + "..." : line;
            logger.LogInformation("[Task {TaskId}] Received: {Line}", taskId, logLine);

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
            if (root.TryGetProperty("usage", out var usageEl))
            {
                int inputTokens = 0, outputTokens = 0;
                if (usageEl.TryGetProperty("input_tokens", out var inEl) && inEl.ValueKind == JsonValueKind.Number)
                    inputTokens = inEl.GetInt32();
                if (usageEl.TryGetProperty("output_tokens", out var outEl) && outEl.ValueKind == JsonValueKind.Number)
                    outputTokens = outEl.GetInt32();

                if (inputTokens > 0 || outputTokens > 0)
                {
                    UpdateTaskUsage(taskId, inputTokens, outputTokens);
                }
            }

            // ===== 实时流模式 (stream-json) 处理 =====
            if (root.TryGetProperty("type", out var typeEl))
            {
                var type = typeEl.GetString();

                // 1. 助手消息或其 Delta
                if (type == "assistant" || type == "message" || type == "content_block_delta" || type == "message_start")
                {
                    if (type == "message_start" || type == "message")
                    {
                        lock (_lock)
                        {
                            _lastAssistantMessages[taskId] = new System.Text.StringBuilder();
                        }
                    }

                    // 处理 content_block_delta (流式常用)
                    if (root.TryGetProperty("delta", out var deltaEl))
                    {
                        if (deltaEl.TryGetProperty("type", out var det) && det.GetString() == "text_delta")
                        {
                            extractedText = deltaEl.TryGetProperty("text", out var t) ? t.GetString() : null;
                            if (extractedText != null)
                            {
                                lock (_lock)
                                {
                                    if (!_lastAssistantMessages.ContainsKey(taskId)) _lastAssistantMessages[taskId] = new System.Text.StringBuilder();
                                    _lastAssistantMessages[taskId].Append(extractedText);
                                }
                            }
                        }
                        else if (deltaEl.TryGetProperty("type", out var det2) && det2.GetString() == "thought_delta")
                        {
                            var thought = deltaEl.TryGetProperty("thought", out var th) ? th.GetString() : null;
                            if (thought != null) extractedText = $"\x1b[90m[思考: {thought}]\x1b[0m\r\n";
                        }
                    }
                    // 处理完整 message 内容
                    else if (root.TryGetProperty("message", out var msgEl) && msgEl.TryGetProperty("content", out var contentList) && contentList.ValueKind == JsonValueKind.Array)
                    {
                        var sb = new System.Text.StringBuilder();
                        foreach (var item in contentList.EnumerateArray())
                        {
                            if (item.TryGetProperty("type", out var itemTypeEl))
                            {
                                var itemType = itemTypeEl.GetString();
                                if (itemType == "text" && item.TryGetProperty("text", out var textEl))
                                {
                                    var text = textEl.GetString();
                                    sb.Append(text);
                                    lock (_lock)
                                    {
                                        if (!_lastAssistantMessages.ContainsKey(taskId)) _lastAssistantMessages[taskId] = new System.Text.StringBuilder();
                                        _lastAssistantMessages[taskId].Append(text);
                                    }
                                }
                                else if (itemType == "tool_use")
                                {
                                    sb.Append(ParseToolUse(item));
                                }
                                else if (itemType == "AskUserQuestion")
                                {
                                    var question = item.TryGetProperty("question", out var qEl) ? qEl.GetString() : "未提供问题内容";
                                    var requestId = item.TryGetProperty("id", out var rIdEl) ? rIdEl.GetString() : Guid.NewGuid().ToString();

                                    _ = Task.Run(async () =>
                                    {
                                        if (OnAskUserQuestion != null)
                                            await OnAskUserQuestion.Invoke(taskId, question ?? "", requestId!);
                                    });

                                    sb.Append($"\r\n\x1b[33m[Claude 提问: {question}]\x1b[0m\r\n");
                                }
                                else if (itemType == "thought" && item.TryGetProperty("thought", out var thEl))
                                    sb.Append($"\x1b[90m[思考: {thEl.GetString()}]\x1b[0m\r\n");
                            }
                        }
                        extractedText = sb.ToString();
                    }
                }
                else if (type == "system" && root.TryGetProperty("subtype", out var subtypeEl))
                {
                    var subtype = subtypeEl.GetString();
                    if (subtype == "init" && root.TryGetProperty("session_id", out var sidEl))
                    {
                        UpdateTaskSession(taskId, sidEl.GetString());
                    }
                }
                // 5. 执行结果
                else if (type == "result" && root.TryGetProperty("subtype", out var resSubtypeEl) && resSubtypeEl.GetString() == "success")
                {
                    extractedText = "\x1b[32m[回答完成]\x1b[0m\r\n";
                }

                return true;
            }

            // ===== 兼容老版普通 json 输出模式 =====
            if (root.TryGetProperty("session_id", out var oldSessionIdEl))
                UpdateTaskSession(taskId, oldSessionIdEl.GetString());

            if (root.TryGetProperty("result", out var resultEl) && resultEl.ValueKind == JsonValueKind.String)
                extractedText = resultEl.GetString();

            return true;
        }
        catch { return false; }
    }

    private string ParseToolUse(JsonElement item)
    {
        if (!item.TryGetProperty("name", out var nameEl)) return string.Empty;
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
        return $"\r\n\x1b[36m[Claude 正在调用工具: {toolName}{detail}]\x1b[0m\r\n";
    }

    private void UpdateTaskUsage(Guid taskId, int input, int output)
    {
        _ = Task.Run(async () =>
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var t = await db.Tasks.FindAsync(taskId);
            if (t != null)
            {
                t.InputTokens = (t.InputTokens ?? 0) + input;
                t.OutputTokens = (t.OutputTokens ?? 0) + output;
                t.TokensUsed = t.InputTokens + t.OutputTokens;
                await db.SaveChangesAsync();
            }
        });
    }

    private void UpdateTaskSession(Guid taskId, string? sessionId)
    {
        if (string.IsNullOrEmpty(sessionId)) return;
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
