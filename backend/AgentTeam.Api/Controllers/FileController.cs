using AgentTeam.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/files")]
public class FileController : ControllerBase
{
    private readonly AppDbContext _db;

    public FileController(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// 通过文件 ID 提供文件下载/预览
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetFile(Guid id)
    {
        var fileUpload = await _db.FileUploads.FindAsync(id);
        if (fileUpload == null)
            return NotFound(new { error = "文件不存在" });

        if (!System.IO.File.Exists(fileUpload.FilePath))
            return NotFound(new { error = "文件已被删除" });

        var mimeType = fileUpload.ContentType;
        if (string.IsNullOrEmpty(mimeType))
        {
            var ext = Path.GetExtension(fileUpload.FilePath).ToLowerInvariant();
            mimeType = ext switch
            {
                ".png" => "image/png",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".gif" => "image/gif",
                ".webp" => "image/webp",
                ".svg" => "image/svg+xml",
                ".bmp" => "image/bmp",
                _ => "application/octet-stream"
            };
        }

        var stream = new FileStream(fileUpload.FilePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        return new FileStreamResult(stream, mimeType)
        {
            FileDownloadName = fileUpload.OriginalFileName
        };
    }
}
