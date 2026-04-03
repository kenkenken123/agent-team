namespace AgentTeam.Api.DTOs;

// ───── Agent DTOs ─────

public record AgentTemplateDto(
    Guid Id,
    string Name,
    string Description,
    string SystemPrompt,
    bool IsEnabled,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateAgentTemplateRequest(
    string Name,
    string? Description,
    string SystemPrompt
);

public record UpdateAgentTemplateRequest(
    string Name,
    string? Description,
    string SystemPrompt,
    bool IsEnabled
);

public record AgentDto(
    Guid Id,
    string Name,
    Guid TemplateId,
    AgentTemplateDto? Template,
    string? WorkingDirectory,
    string AllowedModels,
    int? MaxTurns,
    bool IsEnabled,
    string Status, // 'idle', 'working', etc.
    string? LatestTaskPrompt,
    Guid? LatestTaskId,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateAgentRequest(
    string Name,
    Guid TemplateId,
    string? WorkingDirectory,
    string AllowedModels,
    int? MaxTurns
);

public record UpdateAgentRequest(
    string Name,
    Guid TemplateId,
    string? WorkingDirectory,
    string AllowedModels,
    int? MaxTurns,
    bool IsEnabled
);

// ───── Common Path DTOs ─────

public record CommonPathDto(
    Guid Id,
    string Path,
    string Name,
    DateTime CreatedAt
);

public record CreateCommonPathRequest(
    string Path,
    string Name
);

public record UpdateCommonPathRequest(
    string Path,
    string Name
);

// ───── Task DTOs ─────

public record TaskDto(
    Guid Id,
    Guid AgentId,
    string AgentName,
    string? WorkingDirectory,
    string Prompt,
    string Status,
    string? ClaudeSessionId,
    string TerminalType,
    int? TokensUsed,
    int? InputTokens,
    int? OutputTokens,
    string? Model,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    int? ExitCode,
    DateTime CreatedAt
);

public record CreateTaskRequest(
    Guid AgentId,
    string Prompt,
    /// <summary>可选：指定从哪个 Session 继续（留空则尝试自动续写）</summary>
    string? ResumeSessionId = null,
    /// <summary>是否强制开启新会话（即便有历史 Session 也不续写）</summary>
    bool ForceNewSession = false,
    string? Model = null,
    string TerminalType = "powershell",
    string? WorkingDirectory = null
);

// ───── Stats DTOs ─────

public record OverviewStats(
    int TotalAgents,
    int RunningTasks,
    int TodayTasks,
    int TodayInputTokens,
    int TodayOutputTokens
);
