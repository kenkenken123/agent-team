namespace AgentTeam.Api.Models;

public enum MessageStatus
{
    Pending,
    Routed,
    NoAgent,
    Failed
}

public class IncomingMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Source { get; set; } = "WebPage";
    public string? SourceMessageId { get; set; }
    public string RawContent { get; set; } = string.Empty;
    public string ParsedText { get; set; } = string.Empty;
    public MessageStatus Status { get; set; } = MessageStatus.Pending;
    
    public Guid? TriggeredTaskId { get; set; }
    public Guid? TriggeredAgentId { get; set; }
    public string? RouterReason { get; set; }
    public string? ImageUrls { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
