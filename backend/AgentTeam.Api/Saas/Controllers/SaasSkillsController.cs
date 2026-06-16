using AgentTeam.Api.Saas.DTOs;
using AgentTeam.Api.Saas.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace AgentTeam.Api.Saas.Controllers;

[Authorize]
[ApiController]
[Route("api/saas/skills")]
public class SaasSkillsController : ControllerBase
{
    [HttpGet]
    public IActionResult GetSkills()
    {
        try
        {
            var userId = GetUserId();
            var skillsDir = SaasPathHelper.GetSkillsDir(userId);
            var result = new List<SkillDto>();

            if (Directory.Exists(skillsDir))
            {
                var dirs = Directory.GetDirectories(skillsDir);
                foreach (var dir in dirs)
                {
                    var skillName = Path.GetFileName(dir);
                    var claudeMdPath = Path.Combine(dir, "CLAUDE.md");
                    var description = "";
                    if (System.IO.File.Exists(claudeMdPath))
                    {
                        description = System.IO.File.ReadAllText(claudeMdPath);
                    }
                    var createdAt = Directory.GetCreationTime(dir);
                    result.Add(new SkillDto(skillName, description, createdAt));
                }
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost]
    public IActionResult CreateSkill([FromBody] CreateSkillRequest req)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(req.SkillName))
            {
                return BadRequest(new { error = "Skill 名称不能为空。" });
            }

            var name = req.SkillName.Trim();
            if (!Regex.IsMatch(name, "^[a-zA-Z0-9_-]+$"))
            {
                return BadRequest(new { error = "Skill 名称只能包含字母、数字、下划线和连字符。" });
            }

            var skillsDir = SaasPathHelper.GetSkillsDir(userId);
            var skillPath = Path.Combine(skillsDir, name);
            if (Directory.Exists(skillPath))
            {
                return BadRequest(new { error = "Skill 已存在。" });
            }

            Directory.CreateDirectory(skillPath);
            var claudeMdPath = Path.Combine(skillPath, "CLAUDE.md");
            System.IO.File.WriteAllText(claudeMdPath, req.Description ?? "");

            return Ok(new SkillDto(name, req.Description ?? "", Directory.GetCreationTime(skillPath)));
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("{name}/content")]
    public IActionResult GetSkillContent(string name)
    {
        try
        {
            var userId = GetUserId();
            if (!Regex.IsMatch(name, "^[a-zA-Z0-9_-]+$"))
            {
                return BadRequest(new { error = "无效的 Skill 名称。" });
            }

            var skillsDir = SaasPathHelper.GetSkillsDir(userId);
            var skillPath = Path.Combine(skillsDir, name);
            if (!Directory.Exists(skillPath))
            {
                return NotFound(new { error = "Skill 未找到。" });
            }

            var claudeMdPath = Path.Combine(skillPath, "CLAUDE.md");
            var content = "";
            if (System.IO.File.Exists(claudeMdPath))
            {
                content = System.IO.File.ReadAllText(claudeMdPath);
            }

            return Ok(new { content });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{name}/content")]
    public IActionResult UpdateSkillContent(string name, [FromBody] UpdateSkillRequest req)
    {
        try
        {
            var userId = GetUserId();
            if (!Regex.IsMatch(name, "^[a-zA-Z0-9_-]+$"))
            {
                return BadRequest(new { error = "无效的 Skill 名称。" });
            }

            var skillsDir = SaasPathHelper.GetSkillsDir(userId);
            var skillPath = Path.Combine(skillsDir, name);
            if (!Directory.Exists(skillPath))
            {
                return NotFound(new { error = "Skill 未找到。" });
            }

            var claudeMdPath = Path.Combine(skillPath, "CLAUDE.md");
            System.IO.File.WriteAllText(claudeMdPath, req.Description ?? "");

            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{name}")]
    public IActionResult DeleteSkill(string name)
    {
        try
        {
            var userId = GetUserId();
            if (!Regex.IsMatch(name, "^[a-zA-Z0-9_-]+$"))
            {
                return BadRequest(new { error = "无效的 Skill 名称。" });
            }

            var skillsDir = SaasPathHelper.GetSkillsDir(userId);
            var skillPath = Path.Combine(skillsDir, name);
            if (!Directory.Exists(skillPath))
            {
                return NotFound(new { error = "Skill 未找到。" });
            }

            Directory.Delete(skillPath, true);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private Guid GetUserId()
    {
        var nameIdentifier = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(nameIdentifier) || !Guid.TryParse(nameIdentifier, out var userId))
        {
            throw new UnauthorizedAccessException("未登录或 Token 无效。");
        }
        return userId;
    }
}
