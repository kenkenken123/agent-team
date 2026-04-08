namespace AgentTeam.Api.Models;

/// <summary>
/// 风险等级枚举
/// </summary>
public enum RiskLevel
{
    Low,
    Medium,
    High
}

/// <summary>
/// 等待中的授权请求（由 HTTP Hook 创建）
/// </summary>
public class PermissionRequest
{
    public string RequestId { get; set; } = Guid.NewGuid().ToString("N");
    public Guid TaskId { get; set; }
    public string ToolName { get; set; } = string.Empty;
    public string InputDisplay { get; set; } = string.Empty;  // 格式化后的参数摘要（用于展示）
    public string RawInput { get; set; } = string.Empty;      // 原始 JSON
    public RiskLevel RiskLevel { get; set; } = RiskLevel.Medium;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Claude Code HTTP Hook 推送的 payload（标准格式）
/// </summary>
public class ClaudeHookPayload
{
    public string SessionId { get; set; } = string.Empty;
    public string ToolName { get; set; } = string.Empty;
    public System.Text.Json.JsonElement ToolInput { get; set; }
}

/// <summary>
/// 前端提交的授权决定
/// </summary>
public class PermissionDecisionRequest
{
    public string Decision { get; set; } = "deny"; // "allow" | "deny"
}

/// <summary>
/// 返回给 Claude Code 的 Hook 响应（标准格式）
/// </summary>
public class ClaudeHookResponse
{
    public string Decision { get; set; } = "deny"; // "allow" | "deny"
}
