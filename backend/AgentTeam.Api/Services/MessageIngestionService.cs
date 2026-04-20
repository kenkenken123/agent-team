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
    ButlerMemoryService memoryService,
    ILogger<MessageIngestionService> logger)
{
    public async Task<IncomingMessage> IngestAsync(ParsedMessage message)
    {
        // 1. 处理待澄清合并
        var pendingQ = await memoryService.GetPendingClarificationAsync();
        if (!string.IsNullOrEmpty(pendingQ) && !message.AgentId.HasValue)
        {
            logger.LogInformation("发现待澄清问题，正在合并：{Pending}", pendingQ);
            message.Text = $"【背景回忆】我之前问过：\"{pendingQ}\"\n【补充/继续】现在我补充/继续说：\"{message.Text}\"";
            await memoryService.ClearPendingClarificationAsync();
        }

        var incoming = new IncomingMessage
        {
            Source = message.SourceName,
            SourceMessageId = message.SenderId,
            ParsedText = message.Text,
            RawContent = System.Text.Json.JsonSerializer.Serialize(message),
            Status = MessageStatus.Pending,
            ImageUrls = message.ImageUrls
        };

        db.IncomingMessages.Add(incoming);
        await db.SaveChangesAsync();

        // 记录到全局短期记忆
        await memoryService.AddShortTermMemoryAsync("user", message.Text);

        try
        {
            Guid? agentId;
            string reason;
            string? extractedPath = null;

            // 2. 路由分析
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
                    incoming.TriggeredAgentName = agent.Name;

                    // 3. 延迟优化 (此时已有 agentId，可以带上 Agent 专属记忆)
                    var originalPromptText = message.Text; 
                    if (message.OptimizePrompt)
                    {
                        try
                        {
                            var optimized = await router.OptimizePromptAsync(message.Text, agentId);
                            if (!string.IsNullOrEmpty(optimized))
                            {
                                message.Text = optimized;
                                incoming.ParsedText = optimized;
                                incoming.RouterReason += " | Prompt 已由管家结合 Agent 上下文优化";
                            }
                        }
                        catch (Exception ex)
                        {
                            logger.LogWarning(ex, "Failed to optimize prompt with agent context");
                        }
                    }

                    // 4. 创建任务
                    var task = new AgentTask
                    {
                        AgentId = agent.Id,
                        Agent = agent,
                        Prompt = originalPromptText, // 原始输入作为 Prompt
                        OptimizedPrompt = incoming.ParsedText != originalPromptText ? incoming.ParsedText : null, // 如果优化了，存入 OptimizedPrompt
                        WorkingDirectory = agent.WorkingDirectory ?? extractedPath,
                        Model = agent.AllowedModels.Split(',')[0],
                        UsePlatformConfig = false,
                        TerminalType = "powershell",
                        ImageUrls = message.ImageUrls
                    };

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
                // 无匹配 Agent，进入待澄清流程
                incoming.Status = MessageStatus.NoAgent;
                if (!message.AgentId.HasValue)
                {
                    await memoryService.SavePendingClarificationAsync(message.Text);
                    incoming.RouterReason = "管家未找到合适 Agent，已记录为待澄清状态。";
                }
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
