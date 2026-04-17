namespace AgentTeam.Api.Models;

public class AgentGroup
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>颜色标识,如 #4676e5</summary>
    public string? Color { get; set; }
    /// <summary>排序权重,越小越靠前</summary>
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Agent> Agents { get; set; } = [];
}
