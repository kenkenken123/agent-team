using System.Diagnostics;

namespace AgentTeam.Api.Services;

public class TerminalService
{
    private readonly ILogger<TerminalService> _logger;

    public TerminalService(ILogger<TerminalService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// 在指定目录打开终端
    /// </summary>
    public void OpenTerminal(string path, string terminalType = "powershell")
    {
        if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
        {
            throw new ArgumentException($"目录不存在: {path}");
        }

        var resolvedPath = Path.GetFullPath(path);
        _logger.LogInformation("Opening terminal in: {Path}, type: {TerminalType}", resolvedPath, terminalType);

        ProcessStartInfo startInfo;

        switch (terminalType.ToLower())
        {
            case "wt":
            case "windows-terminal":
                // Windows Terminal - 优先尝试
                startInfo = new ProcessStartInfo
                {
                    FileName = "wt.exe",
                    Arguments = $"-d \"{resolvedPath}\"",
                    UseShellExecute = true
                };
                break;

            case "cmd":
                // CMD
                startInfo = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/k cd /d \"{resolvedPath}\"",
                    WorkingDirectory = resolvedPath,
                    UseShellExecute = true
                };
                break;

            case "powershell":
            default:
                // PowerShell
                startInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-NoExit -Command \"cd '{resolvedPath}'\"",
                    WorkingDirectory = resolvedPath,
                    UseShellExecute = true
                };
                break;
        }

        try
        {
            Process.Start(startInfo);
        }
        catch (Exception ex)
        {
            // 如果首选终端不可用，回退到 cmd
            if (terminalType.ToLower() != "cmd")
            {
                _logger.LogWarning("Failed to open {TerminalType}, falling back to cmd: {Error}", terminalType, ex.Message);
                var fallback = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/k cd /d \"{resolvedPath}\"",
                    WorkingDirectory = resolvedPath,
                    UseShellExecute = true
                };
                Process.Start(fallback);
            }
            else
            {
                throw new InvalidOperationException($"无法打开终端: {ex.Message}", ex);
            }
        }
    }
}
