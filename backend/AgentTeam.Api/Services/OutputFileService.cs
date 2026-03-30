namespace AgentTeam.Api.Services;

/// <summary>
/// 任务输出文件服务：将终端输出写入 data/outputs/{taskId}.log
/// </summary>
public class OutputFileService(IWebHostEnvironment env, ILogger<OutputFileService> logger)
{
    private string DataRoot => Path.Combine(env.ContentRootPath, "data");
    private string OutputsDir => Path.Combine(DataRoot, "outputs");

    public string GetOutputPath(Guid taskId)
    {
        Directory.CreateDirectory(OutputsDir);
        return Path.Combine(OutputsDir, $"{taskId}.log");
    }

    public async Task AppendAsync(string filePath, string content)
    {
        try
        {
            using var fs = new FileStream(filePath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
            using var sw = new StreamWriter(fs);
            await sw.WriteAsync(content);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "写入任务输出文件失败: {FilePath}", filePath);
        }

    }

    public async Task<string> ReadAsync(Guid taskId)
    {
        var path = GetOutputPath(taskId);
        if (!File.Exists(path)) return string.Empty;
        try
        {
            // 使用 FileShare.ReadWrite 允许读取正在被写入的文件
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var sr = new StreamReader(fs);
            return await sr.ReadToEndAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "读取任务输出文件失败: {FilePath}", path);
            return string.Empty;
        }
    }

    public void Delete(Guid taskId)
    {
        var path = GetOutputPath(taskId);
        if (File.Exists(path))
        {
            try { File.Delete(path); } catch { /* 忽略删除异常 */ }
        }
    }
}

