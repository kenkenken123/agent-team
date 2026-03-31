using Microsoft.AspNetCore.Mvc;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CommandsController : ControllerBase
{
    // Hardcoded list of Claude Code slash commands based on test output
    private static readonly string[] _commands =
    [
        "/update-config",
        "/debug",
        "/simplify",
        "/batch",
        "/loop",
        "/schedule",
        "/claude-api",
        "/artifacts-builder",
        "/docx",
        "/figma-implement-design",
        "/prototype-prompt-generator",
        "/rapid-prototyping",
        "/skill-creator",
        "/stitch-design",
        "/superdesign",
        "/webapp-testing",
        "/xlsx",
        "/commit",
        "/compact",
        "/context",
        "/cost",
        "/heapdump",
        "/init",
        "/pr-comments",
        "/release-notes",
        "/review",
        "/security-review",
        "/insights"
    ];

    [HttpGet]
    public IActionResult GetCommands()
    {
        return Ok(new { commands = _commands });
    }
}
