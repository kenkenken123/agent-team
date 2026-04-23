using AgentTeam.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Services;

/// <summary>
/// 定时扫描超过48小时没有新聊天记录的会话，将其标记为待删除。
/// 标记后超过72小时（即总共120小时无新任务）自动删除会话。
/// 每小时执行一次。
/// </summary>
public class SessionCleanupBackgroundService(
    IServiceProvider serviceProvider,
    ILogger<SessionCleanupBackgroundService> logger) : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(1);
    /// <summary>无新消息多久后标记为待删除（48小时）</summary>
    private static readonly TimeSpan StaleThreshold = TimeSpan.FromHours(48);
    /// <summary>标记后多久自动删除（72小时）</summary>
    private static readonly TimeSpan DeletionDelay = TimeSpan.FromHours(72);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation(
            "会话清理后台服务已启动，扫描间隔: {Interval}, 标记阈值: {StaleThreshold}, 自动删除延迟: {DeletionDelay}",
            CheckInterval, StaleThreshold, DeletionDelay);

        // 启动时先执行一次清理
        await RunCleanupAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(CheckInterval, stoppingToken);
                if (!stoppingToken.IsCancellationRequested)
                {
                    await RunCleanupAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                logger.LogInformation("会话清理后台服务已取消");
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "会话清理后台服务执行时发生异常");
            }
        }
    }

    private async Task RunCleanupAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var outputFileService = scope.ServiceProvider.GetRequiredService<OutputFileService>();

            var now = DateTime.UtcNow;
            var staleThreshold = now - StaleThreshold;
            var deletionThreshold = now - DeletionDelay;

            // ── 步骤1: 删除已标记超过72小时的会话 ──
            var sessionsToDelete = await db.Tasks
                .Where(t => t.ClaudeSessionId != null
                            && t.MarkedForDeletionAt != null
                            && t.MarkedForDeletionAt < deletionThreshold)
                .GroupBy(t => t.ClaudeSessionId)
                .Select(g => g.Key)
                .ToListAsync(cancellationToken);

            if (sessionsToDelete.Count > 0)
            {
                foreach (var sessionId in sessionsToDelete)
                {
                    var tasksInSession = await db.Tasks
                        .Where(t => t.ClaudeSessionId == sessionId)
                        .ToListAsync(cancellationToken);

                    foreach (var task in tasksInSession)
                    {
                        // 如果任务在运行中，先取消
                        if (task.Status == AgentTeam.Api.Models.TaskStatus.Running)
                        {
                            var claudeService = scope.ServiceProvider.GetService<ClaudeCodeService>();
                            if (claudeService != null)
                            {
                                try { await claudeService.CancelTaskAsync(task.Id); }
                                catch { /* ignore */ }
                            }
                        }
                        // 删除磁盘日志
                        try { outputFileService.Delete(task.Id); }
                        catch { /* ignore */ }
                        db.Tasks.Remove(task);
                    }

                    logger.LogInformation("会话 {SessionId} 已自动删除（共 {Count} 个任务）", sessionId, tasksInSession.Count);
                }

                await db.SaveChangesAsync(cancellationToken);
            }

            // ── 步骤2: 标记新的过期会话 ──
            var sessionGroups = await db.Tasks
                .Where(t => t.ClaudeSessionId != null && t.MarkedForDeletionAt == null)
                .GroupBy(t => t.ClaudeSessionId)
                .Select(g => new
                {
                    SessionId = g.Key,
                    LatestTaskTime = g.Max(t => t.StartedAt != null ? t.StartedAt : t.CreatedAt)
                })
                .Where(x => x.LatestTaskTime < staleThreshold)
                .ToListAsync(cancellationToken);

            if (sessionGroups.Count > 0)
            {
                var staleSessionIds = sessionGroups.Select(x => x.SessionId!).ToList();

                var tasksToMark = await db.Tasks
                    .Where(t => t.ClaudeSessionId != null && staleSessionIds.Contains(t.ClaudeSessionId))
                    .ToListAsync(cancellationToken);

                foreach (var task in tasksToMark)
                {
                    task.MarkedForDeletionAt = now;
                }

                await db.SaveChangesAsync(cancellationToken);
                logger.LogInformation("已标记 {SessionCount} 个过期会话（共 {TaskCount} 个任务）为待删除，将于 {DeleteAt} 自动删除",
                    staleSessionIds.Count, tasksToMark.Count, now + DeletionDelay);
            }

            // ── 步骤3: 恢复活跃会话 ──
            var revivedSessionGroups = await db.Tasks
                .Where(t => t.ClaudeSessionId != null && t.MarkedForDeletionAt != null)
                .GroupBy(t => t.ClaudeSessionId)
                .Select(g => new
                {
                    SessionId = g.Key,
                    LatestTaskTime = g.Max(t => t.StartedAt != null ? t.StartedAt : t.CreatedAt)
                })
                .Where(x => x.LatestTaskTime >= staleThreshold)
                .ToListAsync(cancellationToken);

            if (revivedSessionGroups.Count > 0)
            {
                var revivedSessionIds = revivedSessionGroups.Select(x => x.SessionId!).ToList();

                var tasksToUnmark = await db.Tasks
                    .Where(t => t.ClaudeSessionId != null && revivedSessionIds.Contains(t.ClaudeSessionId))
                    .ToListAsync(cancellationToken);

                foreach (var task in tasksToUnmark)
                {
                    task.MarkedForDeletionAt = null;
                }

                await db.SaveChangesAsync(cancellationToken);
                logger.LogInformation("已恢复 {SessionCount} 个活跃会话（共 {TaskCount} 个任务）的删除标记",
                    revivedSessionIds.Count, tasksToUnmark.Count);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "会话清理任务执行失败");
        }
    }
}
