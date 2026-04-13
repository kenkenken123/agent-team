using System.Diagnostics;
using System.Text;

namespace AgentTeam.Api.Services;

public class GitFileStatus
{
    public string Path { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
}

public class GitStatusInfo
{
    public string Branch { get; set; } = string.Empty;
    public List<GitFileStatus> Files { get; set; } = new();
}

public class GitService
{
    private readonly ILogger<GitService> _logger;

    public GitService(ILogger<GitService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// 使用 ArgumentList 执行 git 命令，避免命令注入漏洞。
    /// ArgumentList 由 OS 处理转义，用户输入无法逃逸参数边界。
    /// </summary>
    private async Task<(int ExitCode, string Output, string Error)> RunGitCommandAsync(
        string workingDirectory,
        IReadOnlyList<string> arguments)
    {
        if (string.IsNullOrWhiteSpace(workingDirectory) || !Directory.Exists(workingDirectory))
        {
            throw new ArgumentException($"Working directory does not exist: {workingDirectory}");
        }

        var processStartInfo = new ProcessStartInfo
        {
            FileName = "git",
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };

        // 使用 ArgumentList 替代 Arguments 字符串拼接，彻底杜绝命令注入
        foreach (var arg in arguments)
        {
            processStartInfo.ArgumentList.Add(arg);
        }

        using var process = new Process { StartInfo = processStartInfo };
        process.Start();

        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();

        await process.WaitForExitAsync();

        var output = await outputTask;
        var error = await errorTask;

        return (process.ExitCode, output, error);
    }

    public async Task<GitStatusInfo> GetStatusAsync(string workingDirectory)
    {
        var info = new GitStatusInfo();

        // Get branch
        var (branchCode, branchOutput, _) = await RunGitCommandAsync(workingDirectory,
            ["branch", "--show-current"]);
        if (branchCode == 0)
        {
            info.Branch = branchOutput.Trim();
        }

        // Get status
        var (statusCode, statusOutput, statusError) = await RunGitCommandAsync(workingDirectory,
            ["status", "-s"]);
        if (statusCode != 0)
        {
            _logger.LogError($"Git status failed: {statusError}");
            throw new Exception($"Git status failed: {statusError}");
        }

        if (!string.IsNullOrWhiteSpace(statusOutput))
        {
            var lines = statusOutput.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var line in lines)
            {
                if (line.Length > 3)
                {
                    var status = line.Substring(0, 2);
                    var filepath = line.Substring(3); // after "XY "
                    info.Files.Add(new GitFileStatus { Status = status, Path = filepath });
                }
            }
        }

        return info;
    }

    public async Task<string> GetDiffAsync(string workingDirectory, string filePath)
    {
        // First check if it is untracked using status
        var (statusCode, statusOutput, _) = await RunGitCommandAsync(workingDirectory,
            ["status", "-s", "--", filePath]);
        bool isUntracked = statusOutput.TrimStart().StartsWith("??");

        if (isUntracked)
        {
            // For untracked files, git diff returns nothing. Read file directly.
            var fullPath = Path.GetFullPath(Path.Combine(workingDirectory, filePath));
            var fullWorkingDir = Path.GetFullPath(workingDirectory);

            // 路径遍历防护：确保文件在工作目录下
            if (!fullPath.StartsWith(fullWorkingDir + Path.DirectorySeparatorChar) &&
                !fullPath.StartsWith(fullWorkingDir + Path.AltDirectorySeparatorChar) &&
                !fullPath.Equals(fullWorkingDir, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("文件路径超出工作目录范围，拒绝访问");
            }

            return await File.ReadAllTextAsync(fullPath);
        }

        var (diffCode, diffOutput, diffError) = await RunGitCommandAsync(workingDirectory,
            ["diff", "HEAD", "--", filePath]);
        if (diffCode != 0)
        {
            _logger.LogError($"Git diff failed: {diffError}");
            throw new Exception($"Git diff failed: {diffError}");
        }

        return diffOutput;
    }

    /// <summary>
    /// Stage all changes, commit with message, and push to remote.
    /// 使用 ArgumentList 传递参数，避免命令注入。
    /// </summary>
    public async Task<(bool Success, string Message)> CommitAndPushAsync(string workingDirectory, string message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return (false, "提交信息不能为空");
        }

        // 1. Stage all changes
        var (addCode, addOut, addErr) = await RunGitCommandAsync(workingDirectory,
            ["add", "-A"]);
        if (addCode != 0)
        {
            _logger.LogError($"Git add failed: {addErr}");
            return (false, $"git add 失败: {addErr}");
        }

        // 2. Check if there are changes to commit
        var (statusCheckCode, statusCheckOut, _) = await RunGitCommandAsync(workingDirectory,
            ["status", "--porcelain"]);
        if (string.IsNullOrWhiteSpace(statusCheckOut))
        {
            return (false, "没有需要提交的更改");
        }

        // 3. Commit — message 作为独立参数，不会被 shell 解析
        var (commitCode, commitOut, commitErr) = await RunGitCommandAsync(workingDirectory,
            ["commit", "-m", message]);
        if (commitCode != 0)
        {
            _logger.LogError($"Git commit failed: {commitErr}");
            return (false, $"git commit 失败: {commitErr}");
        }

        // 4. Push
        var (pushCode, pushOut, pushErr) = await RunGitCommandAsync(workingDirectory,
            ["push"]);
        if (pushCode != 0)
        {
            _logger.LogError($"Git push failed: {pushErr}");
            return (false, $"git push 失败: {pushErr}");
        }

        var commitLine = commitOut.Split('\n').FirstOrDefault(l => !string.IsNullOrWhiteSpace(l)) ?? "提交成功";
        return (true, $"提交并推送成功: {commitLine}");
    }
}
