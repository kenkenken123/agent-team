using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using AgentTeam.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GitController : ControllerBase
{
    private readonly GitService _gitService;
    private readonly AppDbContext _db;
    private readonly ClaudeCodeService _claudeService;
    private readonly MessageRouterService _router;
    private readonly ILogger<GitController> _logger;

    public GitController(
        GitService gitService,
        AppDbContext db,
        ClaudeCodeService claudeService,
        MessageRouterService router,
        ILogger<GitController> logger)
    {
        _gitService = gitService;
        _db = db;
        _claudeService = claudeService;
        _router = router;
        _logger = logger;
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

    /// <summary>
    /// 获取所有分支列表
    /// </summary>
    [HttpGet("branches")]
    public async Task<IActionResult> GetBranches([FromQuery] string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return BadRequest("Path is required");
        }

        try
        {
            var branches = await _gitService.GetBranchesAsync(path);
            return Ok(branches);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// 切换分支
    /// </summary>
    [HttpPost("switch-branch")]
    public async Task<IActionResult> SwitchBranch([FromBody] SwitchBranchRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Path) || string.IsNullOrWhiteSpace(req.Branch))
        {
            return BadRequest("Path and branch are required");
        }

        try
        {
            var (success, message) = await _gitService.SwitchBranchAsync(req.Path, req.Branch);
            if (success)
            {
                return Ok(new { message });
            }
            else
            {
                return BadRequest(new { error = message });
            }
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

    /// <summary>
    /// 一键代码审查：通过管家智能路由选择 Agent，让 Agent 自行完成审查流程
    /// </summary>
    [HttpPost("code-review")]
    public async Task<IActionResult> CodeReview([FromBody] CodeReviewRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Path))
        {
            return BadRequest("Path is required");
        }

        try
        {
            // 通过管家智能路由选择合适的 Agent
            var routingResult = await _router.RouteMessageAsync($"请对这个项目做代码审查，工作目录：{req.Path}");

            if (!routingResult.agentId.HasValue)
            {
                return BadRequest(new { error = $"未找到合适的 Agent: {routingResult.reason}" });
            }

            var agent = await _db.Agents
                .Include(a => a.Template)
                .FirstOrDefaultAsync(a => a.Id == routingResult.agentId.Value);

            if (agent == null)
            {
                return BadRequest(new { error = "选中的 Agent 不存在" });
            }

            if (!agent.IsEnabled)
            {
                return BadRequest(new { error = "选中的 Agent 已被禁用" });
            }

            var model = agent.AllowedModels.Split(',')[0];

            // 简洁的审查 prompt，Agent 自行执行 git 命令获取变更
            var prompt = $"请对当前工作目录 `{req.Path}` 的 Git 变更进行一次完整的代码审查。\n\n" +
                "请先执行 git status 和 git diff 查看所有变更，然后从以下维度审查：\n" +
                "1. **代码质量**：可读性、命名规范、代码结构\n" +
                "2. **潜在 Bug**：逻辑错误、边界条件、异常处理\n" +
                "3. **安全性**：SQL 注入、XSS、敏感信息泄露\n" +
                "4. **性能**：不必要的循环、内存泄漏、N+1 查询\n" +
                "5. **最佳实践**：设计模式、SOLID 原则、DRY 原则\n\n" +
                "请给出详细的审查报告，包括总体评价、发现的问题（按严重程度排序）、具体的修改建议。";

            var task = new AgentTask
            {
                AgentId = agent.Id,
                Agent = agent,
                Prompt = prompt,
                WorkingDirectory = req.Path,
                Model = model,
                TerminalType = "powershell"
            };

            agent.LastUsedAt = DateTime.UtcNow;
            _db.Tasks.Add(task);
            await _db.SaveChangesAsync();

            // 异步启动审查
            _ = _claudeService.StartTaskAsync(task, agent);

            _logger.LogInformation("代码审查任务已创建: TaskId={TaskId}, Agent={AgentName}, Path={Path}",
                task.Id, agent.Name, req.Path);

            return Ok(new
            {
                taskId = task.Id,
                agentName = agent.Name,
                routingReason = routingResult.reason,
                message = "代码审查任务已启动"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "代码审查任务创建失败");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// 根据 Git 变更生成 AI 提交信息
    /// </summary>
    [HttpPost("generate-commit-message")]
    public async Task<IActionResult> GenerateCommitMessage([FromBody] GenerateCommitMessageRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Path))
        {
            return BadRequest("Path is required");
        }

        try
        {
            var status = await _gitService.GetStatusAsync(req.Path);
            var statusSummary = $"Branch: {status.Branch}\nChanges:\n{string.Join("\n", status.Files.Select(f => $"  [{f.Status}] {f.Path}"))}";

            // 如果有变更文件，获取前几个文件的 diff 内容供 AI 分析
            var diffContent = "";
            if (status.Files.Any())
            {
                var filesToDiff = status.Files.Take(5).ToList();
                var diffs = new List<string>();
                foreach (var file in filesToDiff)
                {
                    try
                    {
                        var diff = await _gitService.GetDiffAsync(req.Path, file.Path);
                        if (!string.IsNullOrEmpty(diff))
                        {
                            diffs.Add($"--- {file.Path} ---\n{diff}");
                        }
                    }
                    catch { /* 忽略单个文件的 diff 失败 */ }
                }
                if (diffs.Any())
                {
                    diffContent = "\n\n以下是具体代码变更：\n" + string.Join("\n\n", diffs);
                }
            }

            var message = await _router.GenerateCommitMessageAsync(statusSummary + diffContent);

            if (string.IsNullOrEmpty(message))
            {
                return BadRequest(new { error = "生成失败，请检查 LLM 配置" });
            }

            return Ok(new { message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "生成提交信息失败");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Git 提交并推送
    /// </summary>
    [HttpPost("commit-push")]
    public async Task<IActionResult> CommitAndPush([FromBody] CommitPushRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Path))
        {
            return BadRequest("Path is required");
        }

        if (string.IsNullOrWhiteSpace(req.Message))
        {
            return BadRequest("Commit message is required");
        }

        try
        {
            var (success, message) = await _gitService.CommitAndPushAsync(req.Path, req.Message);
            if (success)
            {
                return Ok(new { message });
            }
            else
            {
                return BadRequest(new { error = message });
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// 撤销单个文件的变更
    /// </summary>
    [HttpPost("revert-file")]
    public async Task<IActionResult> RevertFile([FromBody] RevertFileRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Path) || string.IsNullOrWhiteSpace(req.FilePath))
        {
            return BadRequest("Path and filePath are required");
        }

        try
        {
            var (success, message) = await _gitService.RevertFileAsync(req.Path, req.FilePath, req.Status);
            if (success)
            {
                return Ok(new { message });
            }
            else
            {
                return BadRequest(new { error = message });
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
    /// <summary>
    /// 拉取远程代码
    /// </summary>
    [HttpPost("pull")]
    public async Task<IActionResult> Pull([FromBody] CodeReviewRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Path))
        {
            return BadRequest("Path is required");
        }

        try
        {
            var (success, message) = await _gitService.PullAsync(req.Path);
            if (success)
            {
                return Ok(new { message });
            }
            else
            {
                return BadRequest(new { error = message });
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
}

// Request DTOs
public record CodeReviewRequest(string Path);
public record CommitPushRequest(string Path, string Message);
public record GenerateCommitMessageRequest(string Path);
public record RevertFileRequest(string Path, string FilePath, string Status);
public record SwitchBranchRequest(string Path, string Branch);
