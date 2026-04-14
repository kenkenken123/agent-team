using AgentTeam.Api.Data;
using AgentTeam.Api.MessageSources;
using AgentTeam.Api.Models;
using AgentTeam.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AgentTeam.Api.Services;

public class MessageIngestionService(
    AppDbContext db,
    MessageRouterService router,
    ClaudeCodeService claudeService,
    ILogger<MessageIngestionService> logger)
{
    public async Task<IncomingMessage> IngestAsync(ParsedMessage message)
    {
        var incoming = new IncomingMessage
        {
            Source = message.SourceName,
            SourceMessageId = message.SenderId, // 新增：保存微信 UserId 或其他平台的发送者 ID
            ParsedText = message.Text,
            RawContent = System.Text.Json.JsonSerializer.Serialize(message),
            Status = MessageStatus.Pending,
            ImageUrls = message.ImageUrls
        };

        if (message.OptimizePrompt)
        {
            try
            {
                var optimized = await router.OptimizePromptAsync(message.Text);
                if (!string.IsNullOrEmpty(optimized))
                {
                    message.Text = optimized;
                    incoming.ParsedText = optimized;
                    incoming.RouterReason = "Prompt 已由 AI 优化";
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to optimize prompt in Butler");
            }
        }

        db.IncomingMessages.Add(incoming);
        await db.SaveChangesAsync();

        try
        {
            Guid? agentId;
            string reason;
            string? extractedPath = null;

            if (message.AgentId.HasValue)
            {
                agentId = message.AgentId;
                reason = "用户手动指定 Agent";
            }
            else
            {
                var routingResult = await router.RouteMessageAsync(message.Text);
                agentId = routingResult.agentId;
                reason = routingResult.reason;
                extractedPath = routingResult.extractedPath;
            }
            
            incoming.RouterReason = reason;

            if (agentId.HasValue)
            {
                var agent = await db.Agents.Include(a => a.Template).FirstOrDefaultAsync(a => a.Id == agentId.Value);
                if (agent != null && agent.IsEnabled)
                {
                    incoming.Status = MessageStatus.Routed;
                    incoming.TriggeredAgentId = agentId;

                    // 自动创建一个任务
                    var task = new AgentTask
                    {
                        AgentId = agent.Id,
                        Agent = agent,
                        Prompt = message.Text,
                        WorkingDirectory = agent.WorkingDirectory ?? extractedPath,
                        Model = agent.AllowedModels.Split(',')[0], // 仅用于展示，不注入平台配置
                        UsePlatformConfig = false, // 消息触发不使用平台配置，由系统环境变量提供
                        TerminalType = "powershell", // 默认
                        ImageUrls = message.ImageUrls
                    };

                    // 寻找最近的 SessionId 供上下文继承 (可选逻辑)
                    var lastTask = await db.Tasks
                        .Where(t => t.AgentId == agent.Id && t.ClaudeSessionId != null)
                        .OrderByDescending(t => t.CreatedAt)
                        .FirstOrDefaultAsync();
                    task.ClaudeSessionId = lastTask?.ClaudeSessionId;

                    if (string.IsNullOrEmpty(task.WorkingDirectory))
                    {
                        incoming.Status = MessageStatus.Failed;
                        incoming.RouterReason += " | Agent 且指令中均未发现有效工作目录，无法自动触发任务。";
                    }
                    else
                    {
                        db.Tasks.Add(task);
                        await db.SaveChangesAsync();
                        
                        incoming.TriggeredTaskId = task.Id;
                        
                        // 启动任务
                        _ = claudeService.StartTaskAsync(task, agent);
                    }
                }
                else
                {
                    incoming.Status = MessageStatus.NoAgent;
                    incoming.RouterReason += agent == null ? " | 指定的 Agent 不存在。" : " | 指定的 Agent 已禁用。";
                }
            }
            else
            {
                incoming.Status = MessageStatus.NoAgent;
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error ingesting message");
            incoming.Status = MessageStatus.Failed;
            incoming.RouterReason = $"路由异常: {ex.Message}";
        }

        incoming.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return incoming;
    }
}
