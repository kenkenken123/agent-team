using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UploadController : ControllerBase
{
    private readonly IWebHostEnvironment _env;
    private readonly AppDbContext _db;

    public UploadController(IWebHostEnvironment env, AppDbContext db)
    {
        _env = env;
        _db = db;
    }

    [HttpPost]
    public async Task<IActionResult> UploadImage([FromForm] IFormFile file, [FromForm] Guid? agentId)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "文件为空" });

        var ext = Path.GetExtension(file.FileName);
        var uniqueId = Guid.NewGuid().ToString("N");
        string baseFolder = Path.Combine(_env.ContentRootPath, "data", "uploads");
        var yearMonthDay = DateTime.Now.ToString("yyyy/MM/dd").Replace('/', Path.DirectorySeparatorChar);

        if (agentId.HasValue)
        {
            var agent = await _db.Agents.FindAsync(agentId.Value);
            if (agent != null && !string.IsNullOrWhiteSpace(agent.WorkingDirectory))
            {
                baseFolder = Path.Combine(agent.WorkingDirectory, "temp", "pic");
            }
        }

        var folder = Path.Combine(baseFolder, yearMonthDay);
        if (!Directory.Exists(folder))
            Directory.CreateDirectory(folder);

        var filePath = Path.Combine(folder, uniqueId + ext);

        using var stream = new FileStream(filePath, FileMode.Create);
        await file.CopyToAsync(stream);

        // 保存文件元数据到数据库
        var fileUpload = new FileUpload
        {
            FilePath = filePath,
            OriginalFileName = file.FileName,
            ContentType = file.ContentType,
            Size = file.Length
        };
        _db.FileUploads.Add(fileUpload);
        await _db.SaveChangesAsync();

        // 返回可通过 /api/files/{id} 访问的完整 URL
        var baseUrl = $"{Request.Scheme}://{Request.Host}";
        return Ok(new { url = $"{baseUrl}/api/files/{fileUpload.Id}" });
    }
}
