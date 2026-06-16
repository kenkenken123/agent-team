namespace AgentTeam.Api.Models;

public enum TaskStatus
{
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled
}

public class AgentTask
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AgentId { get; set; }
    public Agent Agent { get; set; } = null!;

    public string Prompt { get; set; } = string.Empty;
    public TaskStatus Status { get; set; } = TaskStatus.Pending;

    /// <summary>Claude Code 对话 ID，用于 --resume 恢复上下文</summary>
    public string? ClaudeSessionId { get; set; }

    /// <summary>执行当前任务时所选的模型</summary>
    public string? Model { get; set; }

    /// <summary>是否使用平台配置（model + apikey + baseurl）。
    /// 当请求显式指定 model 时为 true，此时平台会注入凭据；
    /// 否则为 false，claude 直接使用系统环境变量。</summary>
    public bool UsePlatformConfig { get; set; }

    /// <summary>任务执行时所在的工作目录</summary>
    public string? WorkingDirectory { get; set; }

    /// <summary>是否为 Plan 模式（仅分析规划，不执行代码修改）</summary>
    public bool IsPlanMode { get; set; }

    /// <summary>终端类型：cmd / powershell / bash</summary>
    public string TerminalType { get; set; } = "powershell";

    /// <summary>总 Token 消耗</summary>
    public int? TokensUsed { get; set; }
    public int? InputTokens { get; set; }
    public int? OutputTokens { get; set; }
    /// <summary>输入缓存命中 token（读取缓存，通常优惠计费）</summary>
    public int? CacheReadTokens { get; set; }
    /// <summary>输入缓存创建 token（写入缓存，计费同普通 input）</summary>
    public int? CacheCreationTokens { get; set; }

    /// <summary>API 请求次数（每次 usage 事件计为一次请求）</summary>
    public int? RequestCount { get; set; }

    /// <summary>任务输出日志文件路径</summary>
    public string? OutputFilePath { get; set; }

    /// <summary>任务完成后的最终回答内容（用于快速展示，无需读取完整日志）</summary>
    public string? FinalResult { get; set; }
    public string? ButlerSummary { get; set; }
    public string? OptimizedPrompt { get; set; }

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int? ExitCode { get; set; }
    public string? ImageUrls { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>被标记为待删除的时间。定时任务扫描超过48小时无新任务的会话后设置此字段。</summary>
    public DateTime? MarkedForDeletionAt { get; set; }
}
