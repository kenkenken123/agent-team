using Microsoft.AspNetCore.Mvc;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UploadController : ControllerBase
{
    private readonly IWebHostEnvironment _env;

    public UploadController(IWebHostEnvironment env)
    {
        _env = env;
    }

    [HttpPost]
    public async Task<IActionResult> UploadImage(IFormFile file)
    {
        if (file == null || file.Length == 0) 
            return BadRequest(new { error = "文件为空" });

        var ext = Path.GetExtension(file.FileName);
        var yearMonth = DateTime.Now.ToString("yyyyMM");
        var uniqueId = Guid.NewGuid().ToString("N");
        
        var folder = Path.Combine(_env.ContentRootPath, "data", "uploads", yearMonth);
        if (!Directory.Exists(folder))
            Directory.CreateDirectory(folder);

        var path = Path.Combine(folder, uniqueId + ext);
        
        using var stream = new FileStream(path, FileMode.Create);
        await file.CopyToAsync(stream);

        // 返回包含该文件本地完整绝对路径的结果
        return Ok(new { url = path }); 
    }
}
