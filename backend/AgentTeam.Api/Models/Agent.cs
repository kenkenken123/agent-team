namespace AgentTeam.Api.Models;

public class Agent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public Guid TemplateId { get; set; }
    public AgentTemplate Template { get; set; } = null!;
    public string? WorkingDirectory { get; set; }
    public string AllowedModels { get; set; } = "claude-3-7-sonnet-20250219";
    public int? MaxTurns { get; set; }
    public bool IsEnabled { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public bool IsPinned { get; set; } = false;
    public DateTime? LastUsedAt { get; set; }
    public ICollection<AgentTask> Tasks { get; set; } = [];
}
