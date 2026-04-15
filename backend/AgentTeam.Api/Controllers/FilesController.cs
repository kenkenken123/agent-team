using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using System.IO;
using AgentTeam.Api.DTOs;

namespace AgentTeam.Api.Controllers;

/// <summary>
/// 文件系统浏览控制器
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class FilesController : ControllerBase
{
    /// <summary>
    /// 获取指定目录下的文件和子目录列表
    /// </summary>
    /// <param name="path">目录路径</param>
    /// <returns>目录内容列表</returns>
    [HttpGet("list")]
    public IActionResult List([FromQuery, Required] string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return BadRequest(new { success = false, error = "路径不能为空" });
        }

        // 规范化路径，防止目录遍历攻击
        var fullPath = Path.GetFullPath(path);

        // 验证路径存在
        if (!Directory.Exists(fullPath))
        {
            return NotFound(new { success = false, error = "目录不存在" });
        }

        try
        {
            var entries = new List<FileEntryDto>();

            // 添加目录
            var directories = Directory.GetDirectories(fullPath);
            foreach (var dir in directories)
            {
                var dirInfo = new DirectoryInfo(dir);
                entries.Add(new FileEntryDto(
                    Name: dirInfo.Name,
                    Type: "directory",
                    Size: null,
                    LastModified: dirInfo.LastWriteTimeUtc,
                    Path: dirInfo.FullName
                ));
            }

            // 添加文件
            var files = Directory.GetFiles(fullPath);
            foreach (var file in files)
            {
                var fileInfo = new FileInfo(file);
                entries.Add(new FileEntryDto(
                    Name: fileInfo.Name,
                    Type: "file",
                    Size: fileInfo.Length,
                    LastModified: fileInfo.LastWriteTimeUtc,
                    Path: fileInfo.FullName
                ));
            }

            return Ok(new { success = true, data = entries });
        }
        catch (UnauthorizedAccessException)
        {
            return StatusCode(403, new { success = false, error = "无权访问该目录" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, error = $"读取目录失败: {ex.Message}" });
        }
    }
}
