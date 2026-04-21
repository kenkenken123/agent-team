namespace AgentTeam.Api.Models;

/// <summary>
/// 任务统计快照表。任务完成后写入，与 Task 表解耦，
/// 确保删除会话/任务后仪表盘统计数据不丢失。
/// </summary>
public class TaskStats
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TaskId { get; set; }
    public Guid AgentId { get; set; }
    public string AgentName { get; set; } = string.Empty;

    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public int CacheReadTokens { get; set; }
    public int CacheCreationTokens { get; set; }
    public int TotalTokens => InputTokens + OutputTokens + CacheReadTokens + CacheCreationTokens;

    /// <summary>任务创建时间（用于日期范围查询）</summary>
    public DateTime CreatedAt { get; set; }
}
