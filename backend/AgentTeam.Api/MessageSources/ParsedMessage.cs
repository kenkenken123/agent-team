namespace AgentTeam.Api.MessageSources;

public class ParsedMessage
{
    public string SourceName { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string? SenderId { get; set; }
    public string? ChannelId { get; set; }
    public Dictionary<string, string> Metadata { get; set; } = new();
}
