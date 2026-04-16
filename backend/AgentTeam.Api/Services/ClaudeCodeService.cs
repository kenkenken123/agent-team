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
    private readonly Dictionary<Guid, string> _tempConfigDirs = []; // taskId → temp config dir path
    private readonly Lock _lock = new();
    private readonly bool _isWindows = System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows);

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

        // 清理残留的临时配置目录（进程被强杀时遗留）
        CleanupStaleTempConfigDirs();
    }

    private async Task ExecuteProcessAsync(AgentTask task, Agent agent, string outputPath, CredentialTemplate? template)
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
                WorkingDirectory = task.WorkingDirectory ?? agent.WorkingDirectory,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            },
            EnableRaisingEvents = true
        };

        // 注入配置：创建临时配置目录，凭据写入 settings.json 的 env 字段
        string? tempConfigDir = null;
        if (template != null)
        {
            try
            {
                tempConfigDir = CreateTempConfigDir(task.Id, template);
                lock (_lock) { _tempConfigDirs[task.Id] = tempConfigDir; }
                process.StartInfo.Environment["CLAUDE_CONFIG_DIR"] = tempConfigDir;

                var baseUrl = template.BaseUrl?.Trim();
                logger.LogInformation("[Task {TaskId}] 使用临时配置目录: CLAUDE_CONFIG_DIR={ConfigDir}, 凭据已写入 env, ANTHROPIC_BASE_URL={BaseUrl}",
                    task.Id, tempConfigDir, baseUrl ?? "(未设置)");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "[Task {TaskId}] 创建临时配置目录失败，清理已创建的目录", task.Id);
                if (tempConfigDir != null)
                {
                    try { Directory.Delete(tempConfigDir, true); } catch { }
                    tempConfigDir = null;
                }
                throw new InvalidOperationException("无法创建临时配置目录，请检查权限和磁盘空间", ex);
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

                // 清理临时配置目录
                if (tempConfigDir != null)
                {
                    CleanupTempConfigDir(tempConfigDir);
                    lock (_lock) { _tempConfigDirs.Remove(task.Id); }
                }

                var statusStr = exitCode == 0 ? "Completed" : "Failed";
                await NotifyStatusAsync(task.Id, statusStr);
                logger.LogInformation("任务 {TaskId} 结束，退出码: {ExitCode}", task.Id, exitCode);
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

            // 清理临时配置目录
            string? tempDir;
            lock (_lock)
            {
                _tempConfigDirs.TryGetValue(taskId, out tempDir);
                _tempConfigDirs.Remove(taskId);
            }
            if (tempDir != null) CleanupTempConfigDir(tempDir);

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
            logger.LogInformation("[Task {TaskId}] Sending input: {Input}", taskId, input);
            await process.StandardInput.WriteLineAsync(input);
            await process.StandardInput.FlushAsync();
        }
    }

    // ─── 内部方法 ─────────────────────────────────────────────

    /// <summary>
    /// 创建临时 Claude 配置目录，使用符号链接混合策略：
    /// - settings.json 为真实文件（去除 auth_token，将凭据写入 env 字段）
    /// - 其他子目录/文件通过 junction/硬链接指向原始目录
    /// 这样会话数据等通过链接实际写入原始 .claude 目录，--resume 无需回写同步。
    /// </summary>
    private string CreateTempConfigDir(Guid taskId, CredentialTemplate template)
    {
        var originalDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude");
        var tempDir = Path.Combine(Path.GetTempPath(), $"claude-config-{taskId}");

        logger.LogInformation("[Task {TaskId}] 创建临时配置目录: {TempDir}, 原始目录: {OriginalDir}", taskId, tempDir, originalDir);

        Directory.CreateDirectory(tempDir);

        if (!Directory.Exists(originalDir))
        {
            // 原始目录不存在，只写 settings.json 含凭据 env
            WriteCleanSettingsJson(tempDir, originalDir, template);
            return tempDir;
        }

        // 遍历原始目录，创建符号链接
        foreach (var entry in Directory.GetFileSystemEntries(originalDir))
        {
            var entryName = Path.GetFileName(entry);
            var linkPath = Path.Combine(tempDir, entryName);

            // settings.json 特殊处理：后续单独写入干净版本
            if (entryName == "settings.json") continue;

            if (Directory.Exists(entry))
            {
                // 子目录 → 创建 junction 链接
                CreateDirectoryJunction(linkPath, entry);
            }
            else
            {
                // 普通文件 → 创建硬链接
                CreateFileHardLink(linkPath, entry);
            }
        }

        // 写入干净的 settings.json（移除认证字段 + 写入凭据到 env）
        WriteCleanSettingsJson(tempDir, originalDir, template);

        return tempDir;
    }

    /// <summary>清理临时配置目录（临时目录中只有 settings.json 是真实文件，其余都是链接）</summary>
    private void CleanupTempConfigDir(string tempDir)
    {
        try
        {
            if (!Directory.Exists(tempDir)) return;

            foreach (var entry in Directory.GetFileSystemEntries(tempDir))
            {
                try
                {
                    if (Directory.Exists(entry))
                    {
                        // 子目录：全为 junction 链接，非递归删除链接本身
                        Directory.Delete(entry, recursive: false);
                    }
                    else
                    {
                        // 文件：settings.json 或硬链接失败时的复制文件，直接删除
                        File.Delete(entry);
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "删除临时目录条目失败: {Entry}", entry);
                }
            }

            Directory.Delete(tempDir, true);
            logger.LogInformation("已清理临时配置目录: {TempDir}", tempDir);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "清理临时配置目录失败: {TempDir}", tempDir);
        }
    }

    /// <summary>清理残留的临时配置目录（服务启动时执行，清理进程被强杀遗留的目录）</summary>
    private void CleanupStaleTempConfigDirs()
    {
        try
        {
            var tempRoot = Path.GetTempPath();
            var staleDirs = Directory.GetDirectories(tempRoot, "claude-config-*");
            if (staleDirs.Length == 0) return;

            logger.LogInformation("发现 {Count} 个残留临时配置目录，正在清理...", staleDirs.Length);
            foreach (var dir in staleDirs)
            {
                try { CleanupTempConfigDir(dir); }
                catch (Exception ex) { logger.LogWarning(ex, "清理残留目录失败: {Dir}", dir); }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "扫描残留临时配置目录失败");
        }
    }

    /// <summary>创建目录 junction/symlink 链接</summary>
    private void CreateDirectoryJunction(string linkPath, string targetPath)
    {
        try
        {
            if (_isWindows)
            {
                // Windows: mklink /J 创建 directory junction（不需要管理员权限）
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "cmd",
                    Arguments = $"/c mklink /J \"{linkPath}\" \"{targetPath}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using var proc = System.Diagnostics.Process.Start(psi);
                proc?.WaitForExit(5000);
            }
            else
            {
                // macOS/Linux: 使用符号链接
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "ln",
                    Arguments = $"-s \"{targetPath}\" \"{linkPath}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                };
                using var proc = System.Diagnostics.Process.Start(psi);
                proc?.WaitForExit(5000);
            }

            if (!Directory.Exists(linkPath))
                throw new InvalidOperationException($"创建目录符号链接失败: {linkPath} → {targetPath}");
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            throw new InvalidOperationException($"创建目录符号链接失败: {linkPath} → {targetPath}", ex);
        }
    }

    /// <summary>
    /// 创建文件符号链接/硬链接。
    /// Windows: mklink /H 创建硬链接（不需要管理员权限）
    /// macOS/Linux: ln -s 创建软链接
    /// Fallback: 如果链接创建失败，则直接复制文件。
    /// 注意：复制的文件是静态副本，不会随原始文件更新而变化。
    /// </summary>
    private void CreateFileHardLink(string linkPath, string targetPath)
    {
        try
        {
            if (_isWindows)
            {
                // Windows: mklink /H 创建硬链接
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "cmd",
                    Arguments = $"/c mklink /H \"{linkPath}\" \"{targetPath}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using var proc = System.Diagnostics.Process.Start(psi);
                proc?.WaitForExit(5000);
            }
            else
            {
                // macOS/Linux: ln -s 创建软链接
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "ln",
                    Arguments = $"-s \"{targetPath}\" \"{linkPath}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                };
                using var proc = System.Diagnostics.Process.Start(psi);
                proc?.WaitForExit(5000);
            }

            if (!File.Exists(linkPath))
                throw new InvalidOperationException($"创建文件符号链接失败: {linkPath} → {targetPath}");
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            // 链接失败时 fallback 为复制：文件是静态副本，不会随原始文件更新
            logger.LogWarning("创建文件符号链接失败，fallback 为复制: {Link} → {Target}", linkPath, targetPath);
            try { File.Copy(targetPath, linkPath); } catch { }
        }
    }

    /// <summary>写入干净的 settings.json，移除认证字段，将凭据写入 env 字段</summary>
    private void WriteCleanSettingsJson(string tempDir, string originalDir, CredentialTemplate template)
    {
        var originalSettingsPath = Path.Combine(originalDir, "settings.json");
        var tempSettingsPath = Path.Combine(tempDir, "settings.json");

        // 需要移除的认证字段
        var authFields = new HashSet<string> { "auth_token", "auth", "apiKey" };

        // 构建凭据 env 字段
        var envDict = new Dictionary<string, string>
        {
            ["ANTHROPIC_AUTH_TOKEN"] = template.ApiKey.Trim(),
        };
        var baseUrl = template.BaseUrl?.Trim();
        if (!string.IsNullOrEmpty(baseUrl))
        {
            envDict["ANTHROPIC_BASE_URL"] = baseUrl;
        }

        if (!File.Exists(originalSettingsPath))
        {
            // 原始文件不存在，只写 env 字段
            var cleanObj = new Dictionary<string, object> { ["env"] = envDict };
            var json = JsonSerializer.Serialize(cleanObj, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(tempSettingsPath, json);
            return;
        }

        try
        {
            var originalContent = File.ReadAllText(originalSettingsPath);
            using var doc = JsonDocument.Parse(originalContent);
            var root = doc.RootElement;

            // 构建干净的 JSON：保留非认证字段，注入/合并 env
            var cleanObj = new Dictionary<string, JsonElement>();
            foreach (var prop in root.EnumerateObject())
            {
                if (authFields.Contains(prop.Name)) continue;
                // env 字段需要合并：原始 env + 凭据 env（凭据优先）
                if (prop.Name == "env" && prop.Value.ValueKind == JsonValueKind.Object)
                {
                    // 先从原始 env 中读取，再用凭据覆盖
                    foreach (var envProp in prop.Value.EnumerateObject())
                    {
                        // 不覆盖凭据字段（凭据优先）
                        if (!envDict.ContainsKey(envProp.Name))
                        {
                            envDict[envProp.Name] = envProp.Value.GetString() ?? "";
                        }
                    }
                    continue; // env 字段后续统一写入
                }
                cleanObj[prop.Name] = prop.Value;
            }

            // 写入合并后的 env
            var finalObj = new Dictionary<string, object>();
            foreach (var kv in cleanObj)
            {
                finalObj[kv.Key] = kv.Value;
            }
            finalObj["env"] = envDict;

            var json = JsonSerializer.Serialize(finalObj, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(tempSettingsPath, json);

            logger.LogInformation("已写入干净的 settings.json（移除认证字段 + 凭据写入 env），路径: {Path}", tempSettingsPath);
        }
        catch (Exception ex)
        {
            // Fallback: 尝试直接移除认证字段，保留完整 JSON 结构
            logger.LogWarning(ex, "解析原始 settings.json 失败，尝试直接移除认证字段");
            try
            {
                var fallbackContent = File.ReadAllText(originalSettingsPath);
                var fallbackObj = JsonSerializer.Deserialize<Dictionary<string, object>>(fallbackContent);
                var authFieldsToRemove = new[] { "auth_token", "auth", "apiKey" };
                foreach (var f in authFieldsToRemove) fallbackObj?.Remove(f);
                fallbackObj ??= new Dictionary<string, object>();
                fallbackObj["env"] = envDict;
                var json = JsonSerializer.Serialize(fallbackObj, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(tempSettingsPath, json);
            }
            catch
            {
                // 双重 fallback: 仅保留 env
                var fallbackObj = new Dictionary<string, object> { ["env"] = envDict };
                var json = JsonSerializer.Serialize(fallbackObj, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(tempSettingsPath, json);
            }
        }
    }

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

        // 权限模式：根据任务模式选择
        if (task.IsPlanMode)
        {
            args.Append("--permission-mode plan ");
        }
        else
        {
            // 非 Plan 模式下，默认跳过权限确认以便自动化执行
            args.Append("--dangerously-skip-permissions ");
        }

        if (!string.IsNullOrEmpty(task.Model))
            args.Append($"--model {task.Model} ");

        if (agent.Template != null && !string.IsNullOrWhiteSpace(agent.Template.SystemPrompt))
        {
            // 重要：必须替换换行符为空格，并转义双引号。
            // 换行符（\n 或 \r）在 Windows CMD 下会导致命令输入流被提前截断，从而引发命令解析错误或丢失。
            var escapedPrompt = agent.Template.SystemPrompt.Replace("\r", " ").Replace("\n", " ").Replace("\"", "\\\"");
            args.Append($"--system-prompt \"{escapedPrompt}\" ");
        }

        if (agent.MaxTurns.HasValue)
            args.Append($"--max-turns {agent.MaxTurns} ");

        // Plan 模式已经在前文 --permission-mode 中处理，此处移除无效的 --plan 参数

        // 追加 --output-format stream-json --verbose 以便解析流式的事件与 session_id
        args.Append("--output-format stream-json --verbose ");

        var finalPrompt = task.Prompt;
        if (!string.IsNullOrEmpty(task.ImageUrls))
        {
            var images = task.ImageUrls.Split(';');
            finalPrompt += "\n[附图: " + string.Join(", ", images) + "]";
        }
        // 对用户 Prompt 同样进行清理，原因同上：防止换行符破坏 CMD 命令行结构。
        var escapedUserPrompt = finalPrompt.Replace("\r", " ").Replace("\n", " ").Replace("\"", "\\\"");
        args.Append($"\"{escapedUserPrompt}\"");

        var executable = _isWindows ? "claude.cmd" : "claude";

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
