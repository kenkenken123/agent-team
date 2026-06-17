using System;
using System.IO;

namespace AgentTeam.Api.Saas.Services;

public static class SaasPathHelper
{
    private static readonly string BaseDir = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "agent-dic", "user"));

    public static string GetUserRoot(Guid userId)
    {
        var userDir = Path.GetFullPath(Path.Combine(BaseDir, userId.ToString()));
        if (!Directory.Exists(userDir))
        {
            Directory.CreateDirectory(userDir);
        }
        return userDir;
    }

    public static string ResolveSafe(Guid userId, string subPath)
    {
        var root = GetUserRoot(userId);
        if (string.IsNullOrWhiteSpace(subPath))
        {
            return root;
        }

        var cleanSubPath = subPath.TrimStart('/', '\\');
        var fullPath = Path.GetFullPath(Path.Combine(root, cleanSubPath));

        if (!fullPath.StartsWith(root, StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException("Access denied: path traversal attempt detected.");
        }

        return fullPath;
    }

    public static string GetSkillsDir(Guid userId)
    {
        var skillsDir = ResolveSafe(userId, Path.Combine(".claude", "skills"));
        if (!Directory.Exists(skillsDir))
        {
            Directory.CreateDirectory(skillsDir);
        }
        return skillsDir;
    }

    public static string GetRelativePath(Guid userId, string fullPath)
    {
        if (string.IsNullOrEmpty(fullPath)) return "";
        var root = GetUserRoot(userId);
        var canonicalFullPath = Path.GetFullPath(fullPath);
        if (canonicalFullPath.StartsWith(root, StringComparison.OrdinalIgnoreCase))
        {
            var rel = canonicalFullPath.Substring(root.Length).TrimStart('/', '\\');
            return rel.Replace('\\', '/'); // 统一使用正斜杠
        }
        return "";
    }
}
