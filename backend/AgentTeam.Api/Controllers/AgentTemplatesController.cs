using AgentTeam.Api.Data;
using AgentTeam.Api.DTOs;
using AgentTeam.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/agent-templates")]
public class AgentTemplatesController(AppDbContext db) : ControllerBase
{
    private readonly ILogger<AgentTemplatesController> _logger = LoggerFactory.Create(b => b.AddConsole()).CreateLogger<AgentTemplatesController>();

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var templates = await db.AgentTemplates
            .OrderByDescending(t => t.UpdatedAt)
            .Select(t => new AgentTemplateDto(
                t.Id, t.Name, t.Description, t.SystemPrompt, t.IsEnabled, t.CreatedAt, t.UpdatedAt))
            .ToListAsync();
        return Ok(templates);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var t = await db.AgentTemplates.FindAsync(id);
        if (t == null) return NotFound();
        return Ok(new AgentTemplateDto(t.Id, t.Name, t.Description, t.SystemPrompt, t.IsEnabled, t.CreatedAt, t.UpdatedAt));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAgentTemplateRequest req)
    {
        var t = new AgentTemplate
        {
            Name = req.Name,
            Description = req.Description ?? "",
            SystemPrompt = req.SystemPrompt
        };
        db.AgentTemplates.Add(t);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = t.Id }, new AgentTemplateDto(t.Id, t.Name, t.Description, t.SystemPrompt, t.IsEnabled, t.CreatedAt, t.UpdatedAt));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAgentTemplateRequest req)
    {
        var t = await db.AgentTemplates.FindAsync(id);
        if (t == null) return NotFound();

        t.Name = req.Name;
        t.Description = req.Description ?? "";
        t.SystemPrompt = req.SystemPrompt;
        t.IsEnabled = req.IsEnabled;
        t.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(new AgentTemplateDto(t.Id, t.Name, t.Description, t.SystemPrompt, t.IsEnabled, t.CreatedAt, t.UpdatedAt));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var t = await db.AgentTemplates.FindAsync(id);
        if (t == null) return NotFound();
        db.AgentTemplates.Remove(t);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// 使用 AI 优化系统提示词，使其简洁、抓住核心重点
    /// </summary>
    [HttpPost("optimize-prompt")]
    public async Task<IActionResult> OptimizePrompt([FromBody] System.Text.Json.JsonElement body)
    {
        string? prompt = null;
        if (body.TryGetProperty("systemPrompt", out var spEl) && spEl.ValueKind == System.Text.Json.JsonValueKind.String)
            prompt = spEl.GetString();
        if (body.TryGetProperty("SystemPrompt", out var spEl2) && spEl2.ValueKind == System.Text.Json.JsonValueKind.String)
            prompt = spEl2.GetString();

        if (string.IsNullOrWhiteSpace(prompt))
            return BadRequest(new { message = "提示词不能为空" });

        try
        {
            var optimized = await OptimizeWithClaudeAsync(prompt!);
            return Ok(new { systemPrompt = optimized });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "优化提示词失败");
            return StatusCode(500, new { message = "AI 优化失败: " + ex.Message });
        }
    }

    private async Task<string> OptimizeWithClaudeAsync(string originalPrompt)
    {
        var optimizeInstruction = """
你是一个系统提示词优化专家。请优化以下系统提示词，要求：
1. 简洁精炼，去除冗余
2. 抓住核心重点：角色定位、核心技能、行为约束
3. 保持原意不变，不添加额外要求
4. 输出结果直接是优化后的提示词，不要解释

优化目标：用最少的文字表达完整的能力定义。

待优化提示词：
""" + originalPrompt;

        var isWindows = System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows);
        var executable = isWindows ? "claude.cmd" : "claude";

        // 清理换行符和引号以适配命令行
        var escapedInstruction = optimizeInstruction
            .Replace("\r", " ")
            .Replace("\n", " ")
            .Replace("\"", "\\\"");

        var process = new System.Diagnostics.Process
        {
            StartInfo = new System.Diagnostics.ProcessStartInfo
            {
                FileName = executable,
                Arguments = $"--print --dangerously-skip-permissions --output-format stream-json --verbose \"{escapedInstruction}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            }
        };

        process.Start();

        var sb = new System.Text.StringBuilder();

        // 解析 Claude stream-json 输出，提取文本内容
        var readTask = Task.Run(async () =>
        {
            while (await process.StandardOutput.ReadLineAsync() is { } line)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line) || !line.StartsWith('{'))
                    continue;

                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;

                    if (!root.TryGetProperty("type", out var typeEl)) continue;
                    var type = typeEl.GetString();

                    // assistant/message: 流式文本增量
                    if ((type == "assistant" || type == "message") && root.TryGetProperty("message", out var msgEl))
                    {
                        if (msgEl.TryGetProperty("content", out var contentEl) && contentEl.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in contentEl.EnumerateArray())
                            {
                                if (item.TryGetProperty("type", out var itemType))
                                {
                                    if (itemType.GetString() == "text" && item.TryGetProperty("text", out var textEl))
                                        sb.Append(textEl.GetString());
                                }
                            }
                        }
                    }
                    // result: 最终完整结果，清空之前的累积
                    else if (type == "result" && root.TryGetProperty("result", out var resultEl) && resultEl.ValueKind == JsonValueKind.String)
                    {
                        // result 包含完整回复，用它作为最终结果
                        var resultText = resultEl.GetString();
                        if (!string.IsNullOrWhiteSpace(resultText))
                        {
                            sb.Clear();
                            sb.Append(resultText);
                        }
                    }
                    // content_block_delta: 流式增量（非 verbose 模式）
                    else if (type == "content_block_delta" && root.TryGetProperty("delta", out var deltaEl))
                    {
                        if (deltaEl.TryGetProperty("type", out var deltaType) && deltaType.GetString() == "text_delta")
                        {
                            if (deltaEl.TryGetProperty("text", out var textEl))
                                sb.Append(textEl.GetString());
                        }
                    }
                }
                catch { /* 跳过非 JSON 行 */ }
            }
        });

        var errorOutput = await process.StandardError.ReadToEndAsync();
        await readTask;

        // 设置超时等待
        var timeoutTask = Task.Delay(TimeSpan.FromMinutes(2));
        var exitTask = process.WaitForExitAsync();
        var completedTask = await Task.WhenAny(exitTask, timeoutTask);
        if (completedTask == timeoutTask && !process.HasExited)
        {
            try { process.Kill(); } catch { }
        }

        var output = sb.ToString().Trim();
        if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(output))
        {
            throw new InvalidOperationException($"Claude 执行失败 (退出码: {process.ExitCode})");
        }

        return output;
    }
}

public class OptimizePromptRequest
{
    public string SystemPrompt { get; set; } = "";
}
