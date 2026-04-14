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

    [HttpGet("long-term")]
    public async Task<IActionResult> GetLongTermMemories()
    {
        var memories = await _db.Memories.OrderByDescending(m => m.CreatedAt).ToListAsync();
        return Ok(memories);
    }

    [HttpPut("long-term/{id}")]
    public async Task<IActionResult> UpdateLongTermMemory(Guid id, [FromBody] UpdateMemoryDto dto)
    {
        var memory = await _db.Memories.FindAsync(id);
        if (memory == null) return NotFound();
        memory.Content = dto.Content;
        memory.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(memory);
    }

    [HttpDelete("long-term/{id}")]
    public async Task<IActionResult> DeleteLongTermMemory(Guid id)
    {
        var memory = await _db.Memories.FindAsync(id);
        if (memory == null) return NotFound();
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
