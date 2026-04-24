using AgentTeam.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TerminalController : ControllerBase
{
    private readonly TerminalService _terminalService;
    private readonly ILogger<TerminalController> _logger;

    public TerminalController(
        TerminalService terminalService,
        ILogger<TerminalController> logger)
    {
        _terminalService = terminalService;
        _logger = logger;
    }

    /// <summary>
    /// 在指定目录打开终端
    /// </summary>
    [HttpPost("open")]
    public IActionResult OpenTerminal([FromBody] OpenTerminalRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Path))
        {
            return BadRequest(new { error = "路径不能为空" });
        }

        try
        {
            _terminalService.OpenTerminal(request.Path, request.TerminalType ?? "powershell");
            return Ok(new { message = "终端已打开" });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to open terminal");
            return StatusCode(500, new { error = $"打开终端失败: {ex.Message}" });
        }
    }

    /// <summary>
    /// 打开指定路径的文件夹（系统文件管理器）
    /// </summary>
    [HttpPost("open-folder")]
    public IActionResult OpenFolder([FromBody] OpenFolderRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Path))
        {
            return BadRequest(new { error = "路径不能为空" });
        }

        try
        {
            if (!Directory.Exists(request.Path))
            {
                return BadRequest(new { error = "目录不存在" });
            }

            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = request.Path,
                UseShellExecute = true,
                Verb = "open"
            };
            System.Diagnostics.Process.Start(psi);
            return Ok(new { message = "文件夹已打开" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to open folder");
            return StatusCode(500, new { error = $"打开文件夹失败: {ex.Message}" });
        }
    }
}

public record OpenTerminalRequest(string Path, string? TerminalType);
public record OpenFolderRequest(string Path);
