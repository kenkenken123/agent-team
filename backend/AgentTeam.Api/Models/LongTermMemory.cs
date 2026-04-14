namespace AgentTeam.Api.Models;

public class LongTermMemory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// 记忆内容，不超过2000字
    /// </summary>
    public string Content { get; set; } = string.Empty;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
