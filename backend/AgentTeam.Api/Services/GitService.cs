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

public class GitBranchInfo
{
    public string Name { get; set; } = string.Empty;
    public bool IsRemote { get; set; }
    public bool IsCurrent { get; set; }
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

    /// <summary>
    /// 获取所有本地和远程分支列表
    /// </summary>
    public async Task<List<GitBranchInfo>> GetBranchesAsync(string workingDirectory)
    {
        var branches = new List<GitBranchInfo>();

        // 本地分支
        var (localCode, localOutput, _) = await RunGitCommandAsync(workingDirectory,
            ["branch", "--format=%(refname:short)"]);
        if (localCode == 0)
        {
            var lines = localOutput.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var line in lines.Select(l => l.Trim()))
            {
                if (!string.IsNullOrWhiteSpace(line))
                    branches.Add(new GitBranchInfo { Name = line, IsRemote = false, IsCurrent = false });
            }
        }

        // 远程分支
        var (remoteCode, remoteOutput, _) = await RunGitCommandAsync(workingDirectory,
            ["branch", "-r", "--format=%(refname:short)"]);
        if (remoteCode == 0)
        {
            var lines = remoteOutput.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var line in lines.Select(l => l.Trim()))
            {
                if (!string.IsNullOrWhiteSpace(line) && !line.EndsWith("/HEAD"))
                    branches.Add(new GitBranchInfo { Name = line, IsRemote = true, IsCurrent = false });
            }
        }

        // 获取当前分支标记
        var (currentCode, currentOutput, _) = await RunGitCommandAsync(workingDirectory,
            ["branch", "--show-current"]);
        if (currentCode == 0)
        {
            var current = currentOutput.Trim();
            foreach (var b in branches)
            {
                b.IsCurrent = b.Name == current;
            }
        }

        return branches;
    }

    /// <summary>
    /// 切换分支
    /// </summary>
    public async Task<(bool Success, string Message)> SwitchBranchAsync(string workingDirectory, string branchName)
    {
        if (string.IsNullOrWhiteSpace(branchName))
        {
            return (false, "分支名不能为空");
        }

        // 先暂存当前未提交的更改
        var (stashCode, _, stashErr) = await RunGitCommandAsync(workingDirectory,
            ["stash", "push", "-m", "auto-stash-before-switch"]);
        // stash 没有更改时也会返回 0，不用检查

        // 切换分支
        var (switchCode, switchOut, switchErr) = await RunGitCommandAsync(workingDirectory,
            ["switch", branchName]);
        if (switchCode != 0)
        {
            _logger.LogError($"Git switch failed: {switchErr}");
            return (false, $"切换分支失败: {switchErr}");
        }

        return (true, $"已切换到分支: {branchName}");
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

    /// <summary>
    /// 撤销单个文件的变更
    /// </summary>
    public async Task<(bool Success, string Message)> RevertFileAsync(string workingDirectory, string filePath, string status)
    {
        // 路径安全校验
        var fullPath = Path.GetFullPath(Path.Combine(workingDirectory, filePath));
        var fullWorkingDir = Path.GetFullPath(workingDirectory);
        if (!fullPath.StartsWith(fullWorkingDir + Path.DirectorySeparatorChar) &&
            !fullPath.StartsWith(fullWorkingDir + Path.AltDirectorySeparatorChar) &&
            !fullPath.Equals(fullWorkingDir, StringComparison.OrdinalIgnoreCase))
        {
            return (false, "文件路径超出工作目录范围，拒绝访问");
        }

        var trimmedStatus = status.Trim();

        // 未跟踪文件：直接删除
        if (trimmedStatus == "??")
        {
            try
            {
                if (File.Exists(fullPath))
                    File.Delete(fullPath);
                else if (Directory.Exists(fullPath))
                    Directory.Delete(fullPath, true);
                return (true, $"已删除未跟踪文件: {filePath}");
            }
            catch (Exception ex)
            {
                return (false, $"删除文件失败: {ex.Message}");
            }
        }

        // 暂存区的文件：先取消暂存，再恢复
        if (trimmedStatus.EndsWith("M") || trimmedStatus.EndsWith("A") || trimmedStatus.EndsWith("D"))
        {
            // 取消暂存
            var (unstagedCode, _, unstagedErr) = await RunGitCommandAsync(workingDirectory,
                ["restore", "--staged", "--", filePath]);
            if (unstagedCode != 0)
            {
                _logger.LogWarning($"Git restore --staged warning: {unstagedErr}");
            }
        }

        // 已修改、已删除的文件：恢复为 HEAD 版本
        if (trimmedStatus.Contains("M") || trimmedStatus.Contains("D"))
        {
            var (restoreCode, _, restoreErr) = await RunGitCommandAsync(workingDirectory,
                ["restore", "--", filePath]);
            if (restoreCode != 0)
            {
                _logger.LogError($"Git restore failed for {filePath}: {restoreErr}");
                return (false, $"撤销失败: {restoreErr}");
            }
        }

        return (true, $"已撤销: {filePath}");
    }
}
