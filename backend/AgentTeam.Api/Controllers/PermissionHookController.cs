using System.Text.Json;
using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using AgentTeam.Api.Services;
using AgentTeam.Api.WebSockets;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

/// <summary>
/// Claude Code HTTP Hook 接收端点
/// 使用 type: "http" 配置后，Claude 会将授权请求直接 POST 到此 URL
/// payload 中包含 session_id，通过它查找对应的 AgentTask
/// </summary>
[ApiController]
[Route("api/permission-hook")]
public class PermissionHookController(
    PermissionHookService permissionHookService,
    TaskWebSocketManager wsManager,
    IServiceScopeFactory scopeFactory,
    ILogger<PermissionHookController> logger) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    /// <summary>
    /// 接收 Claude Code 的 HTTP Hook 授权请求
    /// Claude 通过 session_id 关联任务，无需任何路径配置
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Receive([FromBody] ClaudeHookPayload payload)
    {
        logger.LogInformation("[PermissionHook] 收到授权请求，session_id: {SessionId}，工具: {Tool}",
            payload.SessionId, payload.ToolName);

        // 通过 session_id 查找对应的运行中任务
        Guid taskId;
        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var task = await db.Tasks
                .Where(t => t.ClaudeSessionId == payload.SessionId && t.Status == Models.TaskStatus.Running)
                .OrderByDescending(t => t.StartedAt)
                .FirstOrDefaultAsync();

            if (task == null)
            {
                logger.LogWarning("[PermissionHook] 找不到 session_id={SessionId} 对应的运行中任务，默认拒绝", payload.SessionId);
                return Ok(new ClaudeHookResponse { Decision = "deny" });
            }

            taskId = task.Id;
        }

        // 序列化工具输入
        var rawInput = payload.ToolInput.ValueKind != JsonValueKind.Undefined
            ? payload.ToolInput.GetRawText()
            : "{}";

        // 创建挂起的授权请求
        var request = permissionHookService.CreateRequest(taskId, payload.ToolName, rawInput);

        // 通过 WebSocket 通知前端弹出授权对话框
        var wsMsg = JsonSerializer.Serialize(new
        {
            type = "permission_request",
            taskId = taskId.ToString(),
            requestId = request.RequestId,
            toolName = request.ToolName,
            inputDisplay = request.InputDisplay,
            rawInput = request.RawInput,
            riskLevel = request.RiskLevel.ToString(),
            createdAt = request.CreatedAt
        }, JsonOpts);

        await wsManager.BroadcastAsync(taskId, wsMsg);
        logger.LogInformation("[PermissionHook] 已推送授权请求到前端，requestId: {RequestId}", request.RequestId);

        // 挂起，等待前端决定（60秒超时自动拒绝）
        var decision = await permissionHookService.WaitForDecisionAsync(request.RequestId, timeoutSeconds: 60);

        // 推送授权结果消息给前端终端（让用户看到结果）
        var resultMsg = JsonSerializer.Serialize(new
        {
            type = "permission_resolved",
            taskId = taskId.ToString(),
            requestId = request.RequestId,
            decision
        }, JsonOpts);
        await wsManager.BroadcastAsync(taskId, resultMsg);

        return Ok(new ClaudeHookResponse { Decision = decision });
    }
}
