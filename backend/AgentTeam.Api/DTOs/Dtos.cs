namespace AgentTeam.Api.DTOs;

// ───── Agent Group DTOs ─────

public record AgentGroupDto(
    Guid Id,
    string Name,
    string? Description,
    string? Color,
    int SortOrder,
    int AgentCount,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateAgentGroupRequest(
    string Name,
    string? Description,
    string? Color,
    int SortOrder = 0
);

public record UpdateAgentGroupRequest(
    string Name,
    string? Description,
    string? Color,
    int SortOrder
);

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
    bool IsPinned,
    DateTime? LastUsedAt,
    Guid? GroupId,
    AgentGroupDto? Group,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateAgentRequest(
    string Name,
    Guid TemplateId,
    string? WorkingDirectory,
    string AllowedModels,
    int? MaxTurns,
    Guid? GroupId = null,
    bool CreateDirectoryIfMissing = false
);

public record UpdateAgentRequest(
    string Name,
    Guid TemplateId,
    string? WorkingDirectory,
    string AllowedModels,
    int? MaxTurns,
    bool IsEnabled,
    Guid? GroupId = null,
    bool CreateDirectoryIfMissing = false
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
    int? CacheReadTokens,
    int? CacheCreationTokens,
    int? RequestCount,
    string? Model,
    bool IsPlanMode,
    string? FinalResult,
    string? ButlerSummary,
    string? OptimizedPrompt,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    int? ExitCode,
    DateTime CreatedAt,
    DateTime? MarkedForDeletionAt,
    string? SessionTitle = null,
    string? SessionDir = null
);

// ───── Message DTOs ─────

public record IncomingMessageDto(
    Guid Id,
    string Source,
    string? SourceMessageId,
    string ParsedText,
    string Status,
    string? RouterReason,
    Guid? TriggeredAgentId,
    string? TriggeredAgentName,
    Guid? TriggeredTaskId,
    string? ImageUrls,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateTaskRequest(
    Guid? AgentId, // 改为可选，因为可能使用自动识别
    string Prompt,
    /// <summary>可选：指定从哪个 Session 继续（留空则尝试自动续写）</summary>
    string? ResumeSessionId = null,
    /// <summary>是否强制开启新会话（即便有历史 Session 也不续写）</summary>
    bool ForceNewSession = false,
    string? Model = null,
    string TerminalType = "powershell",
    string? WorkingDirectory = null,
    bool AutoIdentifyAgent = false,
    bool OptimizePrompt = false,
    /// <summary>是否为 Plan 模式（仅分析规划，不执行代码修改）</summary>
    bool PlanMode = false
);

// ───── Stats DTOs ─────

public record OverviewStats(
    int TotalAgents,
    int RunningTasks,
    int PeriodTasks,
    int PeriodInputTokens,
    int PeriodOutputTokens,
    int PeriodCacheReadTokens,
    int PeriodCacheCreationTokens,
    int PeriodRequestCount
);

public record AgentUsageDto(
    Guid AgentId,
    string AgentName,
    int TaskCount,
    int InputTokens,
    int OutputTokens,
    int CacheReadTokens,
    int CacheCreationTokens,
    int TotalTokens,
    int RequestCount
);

// ───── File DTOs ─────

public record FileEntryDto(
    string Name,
    string Type, // "file" or "directory"
    long? Size, // null for directories
    DateTime LastModified,
    string Path
);

public record UpdateSessionTitleRequest(
    string Title
);

public record UpdateSessionDirRequest(
    string WorkingDir
);

public record SaveModelsRequest(
    List<string> Models
);
