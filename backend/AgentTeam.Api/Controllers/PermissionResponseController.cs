using AgentTeam.Api.Models;
using AgentTeam.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgentTeam.Api.Controllers;

/// <summary>
/// 前端提交授权决定的端点
/// </summary>
[ApiController]
[Route("api/permission-response")]
public class PermissionResponseController(
    PermissionHookService permissionHookService,
    ILogger<PermissionResponseController> logger) : ControllerBase
{
    /// <summary>
    /// 前端用户点击"允许"或"拒绝"后调用此接口
    /// </summary>
    [HttpPost("{requestId}")]
    public IActionResult Submit(string requestId, [FromBody] PermissionDecisionRequest body)
    {
        var decision = body.Decision?.ToLower() == "allow" ? "allow" : "deny";
        var resolved = permissionHookService.Resolve(requestId, decision);

        if (!resolved)
        {
            logger.LogWarning("[PermissionResponse] requestId {RequestId} 不存在或已超时", requestId);
            return NotFound(new { error = "授权请求不存在或已超时" });
        }

        logger.LogInformation("[PermissionResponse] requestId {RequestId} 已解决，决定: {Decision}", requestId, decision);
        return Ok(new { message = "已提交授权决定", decision });
    }
}
