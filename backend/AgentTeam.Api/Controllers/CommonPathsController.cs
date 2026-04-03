using AgentTeam.Api.Data;
using AgentTeam.Api.DTOs;
using AgentTeam.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/common-paths")]
public class CommonPathsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var paths = await db.CommonPaths
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();
        
        var dtos = paths.Select(p => new CommonPathDto(p.Id, p.Path, p.Name, p.CreatedAt)).ToList();
        return Ok(dtos);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCommonPathRequest req)
    {
        var path = new CommonPath
        {
            Path = req.Path,
            Name = req.Name
        };
        db.CommonPaths.Add(path);
        await db.SaveChangesAsync();
        return Created("", new CommonPathDto(path.Id, path.Path, path.Name, path.CreatedAt));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var path = await db.CommonPaths.FindAsync(id);
        if (path == null) return NotFound();
        db.CommonPaths.Remove(path);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
