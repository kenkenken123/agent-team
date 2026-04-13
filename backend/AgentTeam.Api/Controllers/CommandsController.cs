using Microsoft.AspNetCore.Mvc;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CommandsController : ControllerBase
{
    // 核心内置命令（不依赖于外部 skill 文件的）
    private static readonly string[] _coreCommands =
    [
        "/compact",
        "/context",
        "/cost",
        "/init",
        "/review",
        "/security-review",
        "/pr-comments",
        "/release-notes",
        "/commit",
        "/debug",
        "/heapdump",
        "/update-config",
        "/claude-api"
    ];

    [HttpGet]
    public IActionResult GetCommands()
    {
        var commands = new HashSet<string>(_coreCommands);

        try
        {
            // 动态从用户目录下的 .claude/skills 文件夹获取列表
            var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            var skillsPath = Path.Combine(userProfile, ".claude", "skills");

            if (Directory.Exists(skillsPath))
            {
                var skillDirs = Directory.GetDirectories(skillsPath);
                foreach (var dir in skillDirs)
                {
                    var skillName = Path.GetFileName(dir);
                    // 跳过可能存在的隐藏文件夹或特定系统文件夹
                    if (!skillName.StartsWith('.'))
                    {
                        commands.Add("/" + skillName);
                    }
                }
            }

            // 也可以尝试扫描当前运行目录下的 .claude/skills (如果存在)
            var localSkillsPath = Path.Combine(Directory.GetCurrentDirectory(), ".claude", "skills");
            if (Directory.Exists(localSkillsPath))
            {
                foreach (var dir in Directory.GetDirectories(localSkillsPath))
                {
                    commands.Add("/" + Path.GetFileName(dir));
                }
            }
        }
        catch (Exception ex)
        {
            // 如果扫描失败，至少返回核心命令
            Console.WriteLine($"扫描 Skills 目录失败: {ex.Message}");
        }

        return Ok(new { commands = commands.OrderBy(c => c).ToList() });
    }
}
