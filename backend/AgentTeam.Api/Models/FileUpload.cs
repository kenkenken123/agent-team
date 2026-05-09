namespace AgentTeam.Api.Models;

public class FileUpload
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>本地文件绝对路径</summary>
    public string FilePath { get; set; } = string.Empty;
    /// <summary>原始文件名</summary>
    public string OriginalFileName { get; set; } = string.Empty;
    /// <summary>MIME 类型</summary>
    public string ContentType { get; set; } = string.Empty;
    /// <summary>文件大小(字节)</summary>
    public long Size { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
