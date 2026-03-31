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
    string Description,
    string SystemPrompt
);

public record UpdateAgentTemplateRequest(
    string Name,
    string Description,
    string SystemPrompt,
    bool IsEnabled
);

public record AgentDto(
    Guid Id,
    string Name,
    Guid TemplateId,
    AgentTemplateDto? Template,
    string WorkingDirectory,
    string Model,
    int? MaxTurns,
    bool IsEnabled,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateAgentRequest(
    string Name,
    Guid TemplateId,
    string WorkingDirectory,
    string Model,
    int? MaxTurns
);

public record UpdateAgentRequest(
    string Name,
    Guid TemplateId,
    string WorkingDirectory,
    string Model,
    int? MaxTurns,
    bool IsEnabled
);

// ───── Task DTOs ─────

public record TaskDto(
    Guid Id,
    Guid AgentId,
    string AgentName,
    string Prompt,
    string Status,
    string? ClaudeSessionId,
    string TerminalType,
    int? TokensUsed,
    int? InputTokens,
    int? OutputTokens,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    int? ExitCode,
    DateTime CreatedAt
);

public record CreateTaskRequest(
    Guid AgentId,
    string Prompt,
    /// <summary>可选：指定从哪个 Session 继续（留空则使用 Agent 最后的 Session）</summary>
    string? ResumeSessionId = null,
    string TerminalType = "powershell"
);

// ───── Stats DTOs ─────

public record OverviewStats(
    int TotalAgents,
    int RunningTasks,
    int TodayTasks,
    int TodayInputTokens,
    int TodayOutputTokens
);
