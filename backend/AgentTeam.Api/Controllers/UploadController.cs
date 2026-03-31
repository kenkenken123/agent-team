using AgentTeam.Api.Data;
using Microsoft.AspNetCore.Mvc;

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

        var path = Path.Combine(folder, uniqueId + ext);
        
        using var stream = new FileStream(path, FileMode.Create);
        await file.CopyToAsync(stream);

        // 返回包含该文件本地完整绝对路径的结果
        return Ok(new { url = path }); 
    }
}
