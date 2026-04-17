using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using AgentTeam.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MemoriesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ButlerMemoryService _memoryService;

    public MemoriesController(AppDbContext db, ButlerMemoryService memoryService)
    {
        _db = db;
        _memoryService = memoryService;
    }

    /// <summary>
    /// 获取唯一的长期记忆（单条模式）
    /// </summary>
    [HttpGet("long-term")]
    public async Task<IActionResult> GetLongTermMemory()
    {
        var memory = await _memoryService.GetSingleLongTermMemoryAsync();
        // 返回数组格式保持前端兼容，但只会有0或1条
        return Ok(memory != null ? new[] { memory } : Array.Empty<LongTermMemory>());
    }

    /// <summary>
    /// 更新唯一的长期记忆内容（单条模式）
    /// </summary>
    [HttpPut("long-term")]
    public async Task<IActionResult> UpdateLongTermMemory([FromBody] UpdateMemoryDto dto)
    {
        if (dto.Content.Length > 2200)
        {
            return BadRequest(new { error = "长期记忆内容不能超过2200字" });
        }
        await _memoryService.SaveSingleLongTermMemoryAsync(dto.Content);
        var memory = await _memoryService.GetSingleLongTermMemoryAsync();
        return Ok(memory);
    }

    /// <summary>
    /// 清空长期记忆（单条模式下删除唯一条目）
    /// </summary>
    [HttpDelete("long-term")]
    public async Task<IActionResult> DeleteLongTermMemory()
    {
        var memory = await _db.Memories.FirstOrDefaultAsync();
        if (memory == null) return NotFound(new { error = "没有长期记忆可删除" });
        _db.Memories.Remove(memory);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    [HttpGet("profile")]
    public async Task<IActionResult> GetUserProfile()
    {
        var profile = await _memoryService.GetUserProfileAsync();
        return Content(profile, "application/json");
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateUserProfile([FromBody] UpdateProfileDto dto)
    {
        await _memoryService.SaveUserProfileAsync(dto.ProfileJson);
        return Ok(new { success = true });
    }

    [HttpGet("short-term")]
    public async Task<IActionResult> GetShortTermMemories()
    {
        var memories = await _memoryService.GetShortTermMemoriesAsync();
        return Ok(memories);
    }
}

public class UpdateMemoryDto { public string Content { get; set; } = string.Empty; }
public class UpdateProfileDto { public string ProfileJson { get; set; } = string.Empty; }