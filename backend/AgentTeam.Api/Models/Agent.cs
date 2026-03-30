namespace AgentTeam.Api.Models;

public class Agent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string WorkingDirectory { get; set; } = string.Empty;
    public string SystemPrompt { get; set; } = string.Empty;
    public string Model { get; set; } = "claude-sonnet-4-5";
    public int? MaxTurns { get; set; }
    public string? AllowedTools { get; set; } // JSON array string
    public bool IsEnabled { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<AgentTask> Tasks { get; set; } = [];
}
