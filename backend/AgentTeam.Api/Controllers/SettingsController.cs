using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/settings")]
public class SettingsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var settings = await db.SystemSettings.OrderBy(s => s.Key).ToListAsync();
        
        // 脱敏处理
        var result = settings.Select(s => new
        {
            s.Key,
            s.Description,
            s.UpdatedAt,
            Value = s.Key.Contains("apiKey", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(s.Value)
                ? "******" 
                : s.Value
        });

        return Ok(result);
    }

    [HttpPut]
    public async Task<IActionResult> UpdateRange([FromBody] List<SystemSetting> req)
    {
        foreach (var item in req)
        {
            var existing = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == item.Key);
            
            // 如果传过来的是脱敏的 ******，表示不修改原值
            if (item.Value == "******") continue;

            if (existing != null)
            {
                existing.Value = item.Value;
                existing.Description = item.Description ?? existing.Description;
                existing.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                item.UpdatedAt = DateTime.UtcNow;
                db.SystemSettings.Add(item);
            }
        }

        await db.SaveChangesAsync();
        return Ok(new { message = "设置更新成功" });
    }

    [HttpGet("{key}")]
    public async Task<IActionResult> Get(string key)
    {
        var s = await db.SystemSettings.FirstOrDefaultAsync(x => x.Key == key);
        if (s == null) return NotFound();
        
        var val = key.Contains("apiKey", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(s.Value)
            ? "******"
            : s.Value;
            
        return Ok(new { s.Key, s.Description, Value = val, s.UpdatedAt });
    }
}
