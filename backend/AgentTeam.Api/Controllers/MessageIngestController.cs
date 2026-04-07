using AgentTeam.Api.Data;
using AgentTeam.Api.MessageSources;
using AgentTeam.Api.Models;
using AgentTeam.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/messages")]
public class MessageIngestController(
    AppDbContext db,
    MessageIngestionService ingestionService) : ControllerBase
{
    public record IngestRequest(string Text);

    [HttpPost("ingest")]
    public async Task<IActionResult> Ingest([FromBody] IngestRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest(new { error = "消息内容不能为空" });

        var parsed = new ParsedMessage
        {
            SourceName = "WebPage",
            Text = req.Text
        };

        var result = await ingestionService.IngestAsync(parsed);
        return Ok(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetList([FromQuery] int skip = 0, [FromQuery] int take = 10)
    {
        var total = await db.IncomingMessages.CountAsync();
        var items = await db.IncomingMessages
            .OrderByDescending(m => m.CreatedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync();
            
        return Ok(new { items, total });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var msg = await db.IncomingMessages.FindAsync(id);
        if (msg == null) return NotFound();
        return Ok(msg);
    }
}
