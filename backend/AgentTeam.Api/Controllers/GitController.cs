using AgentTeam.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GitController : ControllerBase
{
    private readonly GitService _gitService;

    public GitController(GitService gitService)
    {
        _gitService = gitService;
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus([FromQuery] string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return BadRequest("Path is required");
        }

        try
        {
            var status = await _gitService.GetStatusAsync(path);
            return Ok(status);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("diff")]
    public async Task<IActionResult> GetDiff([FromQuery] string path, [FromQuery] string filePath)
    {
        if (string.IsNullOrWhiteSpace(path) || string.IsNullOrWhiteSpace(filePath))
        {
            return BadRequest("Path and filePath are required");
        }

        try
        {
            var diff = await _gitService.GetDiffAsync(path, filePath);
            // Return diff as text content
            return Content(diff, "text/plain");
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
}

