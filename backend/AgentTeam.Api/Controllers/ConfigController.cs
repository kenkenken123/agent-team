using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/config")]
public class ConfigController(AppDbContext db) : ControllerBase
{
    // --- 凭据模板管理 ---

    [HttpGet("templates")]
    public async Task<IActionResult> GetTemplates()
    {
        return Ok(await db.CredentialTemplates.ToListAsync());
    }

    [HttpPost("templates")]
    public async Task<IActionResult> CreateTemplate(CredentialTemplate template)
    {
        db.CredentialTemplates.Add(template);
        await db.SaveChangesAsync();
        return Ok(template);
    }

    [HttpPut("templates/{id:guid}")]
    public async Task<IActionResult> UpdateTemplate(Guid id, CredentialTemplate template)
    {
        var existing = await db.CredentialTemplates.FindAsync(id);
        if (existing == null) return NotFound();

        existing.Name = template.Name;
        existing.ApiKey = template.ApiKey;
        existing.BaseUrl = template.BaseUrl;
        existing.IsDefault = template.IsDefault;

        // 如果设置为默认，取消其他默认
        if (existing.IsDefault)
        {
            var others = await db.CredentialTemplates.Where(t => t.Id != id).ToListAsync();
            foreach (var o in others) o.IsDefault = false;
        }

        await db.SaveChangesAsync();
        return Ok(existing);
    }

    [HttpDelete("templates/{id:guid}")]
    public async Task<IActionResult> DeleteTemplate(Guid id)
    {
        var t = await db.CredentialTemplates.FindAsync(id);
        if (t == null) return NotFound();
        db.CredentialTemplates.Remove(t);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // --- 模型映射管理 ---

    [HttpGet("models")]
    public async Task<IActionResult> GetModelConfigs()
    {
        return Ok(await db.ModelConfigs.Include(c => c.Template).ToListAsync());
    }

    [HttpPost("models")]
    public async Task<IActionResult> UpdateModelConfig(ModelConfig config)
    {
        var existing = await db.ModelConfigs.FirstOrDefaultAsync(c => c.ModelId == config.ModelId);
        if (existing != null)
        {
            existing.TemplateId = config.TemplateId;
        }
        else
        {
            db.ModelConfigs.Add(config);
        }
        await db.SaveChangesAsync();
        return Ok(config);
    }

    [HttpDelete("models/{id:guid}")]
    public async Task<IActionResult> DeleteModelConfig(Guid id)
    {
        var c = await db.ModelConfigs.FindAsync(id);
        if (c == null) return NotFound();
        db.ModelConfigs.Remove(c);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
