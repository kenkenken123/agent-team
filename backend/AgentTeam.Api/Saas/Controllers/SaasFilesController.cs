using AgentTeam.Api.Saas.DTOs;
using AgentTeam.Api.Saas.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;

namespace AgentTeam.Api.Saas.Controllers;

[Authorize]
[ApiController]
[Route("api/saas/files")]
public class SaasFilesController : ControllerBase
{
    [HttpGet("list")]
    public IActionResult List([FromQuery] string? path)
    {
        try
        {
            var userId = GetUserId();
            var userRoot = SaasPathHelper.GetUserRoot(userId);
            var safePath = SaasPathHelper.ResolveSafe(userId, path ?? "");

            if (!Directory.Exists(safePath))
            {
                return NotFound(new { error = "目录不存在" });
            }

            var entries = new List<SaasFileEntry>();

            var directories = Directory.GetDirectories(safePath);
            foreach (var dir in directories)
            {
                var dirInfo = new DirectoryInfo(dir);
                if (dirInfo.Name == ".git" || dirInfo.Name == "node_modules") continue;

                entries.Add(new SaasFileEntry(
                    Name: dirInfo.Name,
                    Type: "directory",
                    Size: null,
                    LastModified: dirInfo.LastWriteTimeUtc,
                    RelativePath: GetRelativePath(userRoot, dirInfo.FullName)
                ));
            }

            var files = Directory.GetFiles(safePath);
            foreach (var file in files)
            {
                var fileInfo = new FileInfo(file);
                entries.Add(new SaasFileEntry(
                    Name: fileInfo.Name,
                    Type: "file",
                    Size: fileInfo.Length,
                    LastModified: fileInfo.LastWriteTimeUtc,
                    RelativePath: GetRelativePath(userRoot, fileInfo.FullName)
                ));
            }

            return Ok(entries);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = $"读取目录失败: {ex.Message}" });
        }
    }

    [HttpGet("content")]
    public IActionResult GetContent([FromQuery] string path)
    {
        try
        {
            var userId = GetUserId();
            var safePath = SaasPathHelper.ResolveSafe(userId, path);

            if (!System.IO.File.Exists(safePath))
            {
                return NotFound(new { error = "文件不存在" });
            }

            var info = new FileInfo(safePath);
            if (info.Length > 1024 * 1024 * 5)
            {
                return BadRequest(new { error = "文件过大，无法在线读取预览（超过5MB限制）" });
            }

            var content = System.IO.File.ReadAllText(safePath);
            return Ok(new { content });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("mkdir")]
    public IActionResult Mkdir([FromBody] MkdirRequest req)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(req.Name))
            {
                return BadRequest(new { error = "文件夹名称不能为空" });
            }

            var parentSafe = SaasPathHelper.ResolveSafe(userId, req.ParentPath ?? "");
            var targetPath = Path.Combine(parentSafe, req.Name.Trim());

            var userRoot = SaasPathHelper.GetUserRoot(userId);
            var fullTargetPath = Path.GetFullPath(targetPath);
            if (!fullTargetPath.StartsWith(userRoot, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { error = "非法路径操作" });
            }

            if (Directory.Exists(fullTargetPath))
            {
                return BadRequest(new { error = "文件夹已存在" });
            }

            Directory.CreateDirectory(fullTargetPath);
            return Ok(new { success = true, path = GetRelativePath(userRoot, fullTargetPath) });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("write")]
    public IActionResult Write([FromBody] WriteFileRequest req)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(req.RelativePath))
            {
                return BadRequest(new { error = "路径不能为空" });
            }

            var safePath = SaasPathHelper.ResolveSafe(userId, req.RelativePath);
            var dir = Path.GetDirectoryName(safePath);
            if (dir != null && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            System.IO.File.WriteAllText(safePath, req.Content ?? "");
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("delete")]
    public IActionResult Delete([FromBody] DeleteFileRequest req)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(req.RelativePath))
            {
                return BadRequest(new { error = "路径不能为空" });
            }

            var safePath = SaasPathHelper.ResolveSafe(userId, req.RelativePath);

            var userRoot = SaasPathHelper.GetUserRoot(userId);
            if (safePath.Equals(userRoot, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { error = "无法删除用户根目录" });
            }

            if (Directory.Exists(safePath))
            {
                Directory.Delete(safePath, true);
            }
            else if (System.IO.File.Exists(safePath))
            {
                System.IO.File.Delete(safePath);
            }
            else
            {
                return NotFound(new { error = "未找到目标文件或目录" });
            }

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

    private string GetRelativePath(string root, string fullPath)
    {
        if (fullPath.Length <= root.Length) return "";
        var rel = fullPath.Substring(root.Length).Replace('\\', '/');
        return rel.TrimStart('/');
    }
}
