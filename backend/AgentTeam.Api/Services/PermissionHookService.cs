using System.Collections.Concurrent;
using System.Text.Json;
using AgentTeam.Api.Models;

namespace AgentTeam.Api.Services;

/// <summary>
/// 授权请求协调器：缓存等待中的授权请求，并在前端响应后解除挂起
/// </summary>
public class PermissionHookService
{
    // requestId -> (TaskCompletionSource, PermissionRequest)
    private readonly ConcurrentDictionary<string, (TaskCompletionSource<string> Tcs, PermissionRequest Request)> _pending = new();

    // taskId -> requestId（用于通过 taskId 查找当前挂起的请求）
    private readonly ConcurrentDictionary<Guid, string> _taskToRequest = new();

    private readonly ILogger<PermissionHookService> _logger;

    public PermissionHookService(ILogger<PermissionHookService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// 创建一个等待中的授权请求，返回 requestId
    /// </summary>
    public PermissionRequest CreateRequest(Guid taskId, string toolName, string rawInput)
    {
        var request = new PermissionRequest
        {
            TaskId = taskId,
            ToolName = toolName,
            RawInput = rawInput,
            InputDisplay = FormatInputDisplay(toolName, rawInput),
            RiskLevel = EvaluateRisk(toolName, rawInput),
        };

        var tcs = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[request.RequestId] = (tcs, request);
        _taskToRequest[taskId] = request.RequestId;

        _logger.LogInformation("[Permission] 创建授权请求 {RequestId}，工具: {Tool}，任务: {TaskId}", request.RequestId, toolName, taskId);
        return request;
    }

    /// <summary>
    /// 等待前端授权决定（超时后自动拒绝）
    /// </summary>
    public async Task<string> WaitForDecisionAsync(string requestId, int timeoutSeconds = 60)
    {
        if (!_pending.TryGetValue(requestId, out var item)) return "deny";

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds));
        cts.Token.Register(() =>
        {
            _logger.LogWarning("[Permission] 授权请求 {RequestId} 超时，自动拒绝", requestId);
            item.Tcs.TrySetResult("deny");
        });

        var decision = await item.Tcs.Task;

        _pending.TryRemove(requestId, out _);
        _taskToRequest.TryRemove(item.Request.TaskId, out _);

        _logger.LogInformation("[Permission] 授权请求 {RequestId} 决定: {Decision}", requestId, decision);
        return decision;
    }

    /// <summary>
    /// 前端提交决定，解除挂起
    /// </summary>
    public bool Resolve(string requestId, string decision)
    {
        if (_pending.TryGetValue(requestId, out var item))
        {
            item.Tcs.TrySetResult(decision);
            return true;
        }
        return false;
    }

    /// <summary>
    /// 获取当前 taskId 对应的挂起请求（如有）
    /// </summary>
    public PermissionRequest? GetPendingRequest(string requestId)
    {
        return _pending.TryGetValue(requestId, out var item) ? item.Request : null;
    }

    // ─── 内部辅助 ────────────────────────────────────────────────────────

    private static string FormatInputDisplay(string toolName, string rawInput)
    {
        try
        {
            using var doc = JsonDocument.Parse(rawInput);
            var root = doc.RootElement;

            return toolName switch
            {
                "Bash" => root.TryGetProperty("command", out var cmd) ? cmd.GetString() ?? rawInput : rawInput,
                "Write" or "Edit" or "MultiEdit" => root.TryGetProperty("file_path", out var path) ? $"文件: {path.GetString()}" : rawInput,
                "Read" => root.TryGetProperty("file_path", out var rp) ? $"读取: {rp.GetString()}" : rawInput,
                "Grep" => root.TryGetProperty("pattern", out var pat) ? $"搜索: {pat.GetString()}" : rawInput,
                "WebFetch" or "WebSearch" => root.TryGetProperty("url", out var url) ? url.GetString() ?? rawInput : rawInput,
                _ => rawInput.Length > 200 ? rawInput[..200] + "..." : rawInput
            };
        }
        catch
        {
            return rawInput.Length > 200 ? rawInput[..200] + "..." : rawInput;
        }
    }

    private static RiskLevel EvaluateRisk(string toolName, string rawInput)
    {
        if (toolName == "Bash")
        {
            var lower = rawInput.ToLowerInvariant();
            // 高危命令关键词
            var dangerous = new[] { "rm ", "del ", "rmdir", "format ", "drop ", "truncate",
                                    "mkfs", "dd if=", ":(){", "shutdown", "reboot", "curl | sh",
                                    "wget | sh", "sudo rm", "chmod 777", ">/dev/" };
            if (dangerous.Any(d => lower.Contains(d)))
                return RiskLevel.High;
            return RiskLevel.Medium;
        }

        return toolName switch
        {
            "Write" or "Edit" or "MultiEdit" => RiskLevel.Medium,
            "Read" or "Grep" or "Glob" => RiskLevel.Low,
            "WebFetch" or "WebSearch" => RiskLevel.Medium,
            _ => RiskLevel.Medium
        };
    }
}
