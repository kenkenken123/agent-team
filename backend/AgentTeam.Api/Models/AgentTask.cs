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

    /// <summary>终端类型：cmd / powershell / bash</summary>
    public string TerminalType { get; set; } = "powershell";

    /// <summary>总 Token 消耗</summary>
    public int? TokensUsed { get; set; }
    public int? InputTokens { get; set; }
    public int? OutputTokens { get; set; }

    /// <summary>任务输出日志文件路径</summary>
    public string? OutputFilePath { get; set; }

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int? ExitCode { get; set; }
    public string? ImageUrls { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
