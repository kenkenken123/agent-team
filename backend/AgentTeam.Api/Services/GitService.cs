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

    private async Task<(int ExitCode, string Output, string Error)> RunGitCommandAsync(string workingDirectory, string arguments)
    {
        if (string.IsNullOrWhiteSpace(workingDirectory) || !Directory.Exists(workingDirectory))
        {
            throw new ArgumentException($"Working directory does not exist: {workingDirectory}");
        }

        var processStartInfo = new ProcessStartInfo
        {
            FileName = "git",
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };

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
        var (branchCode, branchOutput, _) = await RunGitCommandAsync(workingDirectory, "branch --show-current");
        if (branchCode == 0)
        {
            info.Branch = branchOutput.Trim();
        }

        // Get status
        var (statusCode, statusOutput, statusError) = await RunGitCommandAsync(workingDirectory, "status -s");
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
        var (statusCode, statusOutput, _) = await RunGitCommandAsync(workingDirectory, "status -s -- \"" + filePath.Replace("\"", "\\\"") + "\"");
        bool isUntracked = statusOutput.TrimStart().StartsWith("??");

        if (isUntracked)
        {
            // For untracked files, git diff returns nothing. We could just cat the file, 
            // or we could use git diff /dev/null filePath.
            // Let's just return a placeholder or cat it here for simplicity.
            return await File.ReadAllTextAsync(Path.Combine(workingDirectory, filePath));
        }

        var (diffCode, diffOutput, diffError) = await RunGitCommandAsync(workingDirectory, "diff HEAD -- \"" + filePath.Replace("\"", "\\\"") + "\"");
        if (diffCode != 0)
        {
            _logger.LogError($"Git diff failed: {diffError}");
            throw new Exception($"Git diff failed: {diffError}");
        }

        return diffOutput;
    }
}

