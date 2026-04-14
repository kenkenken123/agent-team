using System.Text.Json;
using System.Text.Json.Serialization;
using System.Net.Http.Json;
using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AgentTeam.Api.Services;

public class MessageRouterService(
    AppDbContext db,
    IHttpClientFactory httpClientFactory,
    ButlerMemoryService butlerMemoryService,
    ILogger<MessageRouterService> logger)
{
    private class RouterResponse
    {
        [JsonPropertyName("agentId")]
        public string? AgentId { get; set; }
        [JsonPropertyName("reason")]
        public string? Reason { get; set; }
        [JsonPropertyName("workingDirectory")]
        public string? WorkingDirectory { get; set; }
    }

    public async Task<(Guid? agentId, string reason, string? extractedPath)> RouteMessageAsync(string messageText)
    {
        var baseUrlSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.baseUrl");
        var apiKeySetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.apiKey");
        var modelIdSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.modelId");

        var baseUrl = baseUrlSetting?.Value ?? "https://api.openai.com/v1";
        var apiKey = apiKeySetting?.Value;
        var modelId = modelIdSetting?.Value ?? "gpt-4o-mini";

        if (string.IsNullOrEmpty(apiKey))
        {
            return (null, "未配置 LLM API Key，无法进行路由分析。", null);
        }

        var agents = await db.Agents
            .Include(a => a.Template)
            .Where(a => a.IsEnabled)
            .ToListAsync();

        var agentContext = agents.Select(a => new
        {
            id = a.Id,
            name = a.Name,
            description = a.Template.Description,
            systemPromptSummary = a.Template.SystemPrompt.Length > 200
                ? a.Template.SystemPrompt.Substring(0, 200) + "..."
                : a.Template.SystemPrompt
        });

        var memoryContext = await butlerMemoryService.GetMemoryContextAsync(excludeLastUserMessage: true);

        var prompt = $@"你是一个智能分发器。根据以下消息内容以及管家记忆（包含此前的聊天上下文和长期规则），判断是否有合适的 Agent 处理，并尝试提取其中包含的本地文件路径（工作目录）。

【管家记忆上下文】
{memoryContext}

如果有合适的 Agent，返回 JSON 格式: {{""agentId"": ""..."", ""reason"": ""..."", ""workingDirectory"": ""提取到的路径或 null""}}
如果没有任何合适的 Agent 能够解决甚至相关，才可以返回: {{""agentId"": null, ""reason"": ""没找到合适的 Agent"", ""workingDirectory"": null}}

注意：
1. 路径提取应包含盘符和文件夹（如 D:\project\foo）。
2. 不要强行分配 Agent。
3. 请确保返回的是纯 JSON，不要包含任何 markdown 标记。

可用的 Agent 列表：
{JsonSerializer.Serialize(agentContext, new JsonSerializerOptions { WriteIndented = true })}

消息内容：
{messageText}";

        logger.LogInformation("[LLM Router] Request Prompt: {Prompt}", prompt);

        try
        {
            var client = httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

            var requestBody = new
            {
                model = modelId,
                messages = new[] { new { role = "user", content = prompt } }
            };

            var response = await client.PostAsJsonAsync($"{baseUrl.TrimEnd('/')}/chat/completions", requestBody);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                logger.LogError("LLM Router failed: {Error}", error);
                return (null, $"LLM 调用失败: {response.StatusCode}", null);
            }

            var result = await response.Content.ReadFromJsonAsync<JsonElement>();
            var content = result.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
            
            logger.LogInformation("[LLM Router] Raw Response: {Response}", content);

            // 清理可能的 Markdown 格式标记
            if (content.Contains("```"))
            {
                content = content.Replace("```json", "").Replace("```", "").Trim();
            }

            var routerResult = JsonSerializer.Deserialize<RouterResponse>(content);

            if (routerResult?.AgentId != null && Guid.TryParse(routerResult.AgentId, out var agentId))
            {
                return (agentId, routerResult.Reason ?? "匹配到合适的 Agent", routerResult.WorkingDirectory);
            }

            return (null, routerResult?.Reason ?? "没找到合适的 Agent", null);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error routing message with LLM");
            return (null, $"内部错误: {ex.Message}", null);
        }
    }
    public async Task<string> GenerateCommitMessageAsync(string gitStatus)
    {
        var baseUrlSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.baseUrl");
        var apiKeySetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.apiKey");
        var modelIdSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.modelId");

        var baseUrl = baseUrlSetting?.Value ?? "https://api.openai.com/v1";
        var apiKey = apiKeySetting?.Value;
        var modelId = modelIdSetting?.Value ?? "gpt-4o-mini";

        if (string.IsNullOrEmpty(apiKey))
        {
            return string.Empty;
        }

        var systemPrompt = @"你是一个 Git 提交信息生成助手。根据用户提供的 Git 变更摘要，生成一条符合 Conventional Commits 规范的中文提交信息。

规范要求：
1. 格式：`type: 描述内容`
2. 常用 type：feat（新功能）、fix（修复）、docs（文档）、style（格式）、refactor（重构）、perf（性能）、test（测试）、chore（构建/工具）、ci（CI 配置）
3. 描述使用中文，简洁明了，不超过 50 个字符
4. 只返回提交信息本身，不要有任何前言或 Markdown 标记

示例：
- feat: 新增用户登录页面的表单验证
- fix: 修复任务列表滚动时的重复渲染问题
- refactor: 提取公共状态管理逻辑到独立 Hook";

        var userPrompt = $"以下是 Git 变更状态：\n{gitStatus}\n\n请根据以上变更生成一条合适的提交信息。";

        try
        {
            var client = httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

            var requestBody = new
            {
                model = modelId,
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = userPrompt }
                }
            };

            var response = await client.PostAsJsonAsync($"{baseUrl.TrimEnd('/')}/chat/completions", requestBody);
            if (!response.IsSuccessStatusCode)
            {
                return string.Empty;
            }

            var result = await response.Content.ReadFromJsonAsync<JsonElement>();
            var content = result.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";

            // 清理可能的 Markdown 格式标记
            if (content.Contains("```"))
            {
                content = content.Replace("```", "").Trim();
            }

            return content.Trim();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error generating commit message with LLM");
            return string.Empty;
        }
    }

    public async Task<string> OptimizePromptAsync(string originalPrompt)
    {
        var baseUrlSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.baseUrl");
        var apiKeySetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.apiKey");
        var modelIdSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.modelId");

        var baseUrl = baseUrlSetting?.Value ?? "https://api.openai.com/v1";
        var apiKey = apiKeySetting?.Value;
        var modelId = modelIdSetting?.Value ?? "gpt-4o-mini";

        if (string.IsNullOrEmpty(apiKey))
        {
            return originalPrompt; // 无法优化，返回原值
        }

        var memoryContext = await butlerMemoryService.GetMemoryContextAsync(excludeLastUserMessage: true);

        var systemPrompt = $@"你是一个 Prompt 优化专家（管家）。你的任务是结合当前的系统记忆上下文，优化用户的原始指令，使其更清晰、更具体、更容易被后端的执行 Agent 理解。
保持原始核心意图的基础上：
1. 结合【管家记忆上下文】，如果用户提到“那个文件”、“刚才的方法”或缺失了明确的工作目录、文件名，请帮助他直接在 Prompt 中补全这些信息。
2. 明确任务目标。
3. 纠正可能的拼写或逻辑模糊。
4. 如果指令过短或不完整，在明确的记忆参考下补全它。
5. 始终使用中文返回优化后的内容。
6. **只返回优化后的最终指令字符串，不要有其他解释、前言或 Markdown 标签。不要自问自答。**

【管家记忆上下文】
{memoryContext}";

        logger.LogInformation("[LLM Optimizer] Request SystemPrompt: {SystemPrompt}", systemPrompt);
        logger.LogInformation("[LLM Optimizer] Request UserPrompt: {UserPrompt}", originalPrompt);

        try
        {
            var client = httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

            var requestBody = new
            {
                model = modelId,
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = originalPrompt }
                }
            };

            var response = await client.PostAsJsonAsync($"{baseUrl.TrimEnd('/')}/chat/completions", requestBody);
            if (!response.IsSuccessStatusCode)
            {
                return originalPrompt;
            }

            var result = await response.Content.ReadFromJsonAsync<JsonElement>();
            var content = result.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? originalPrompt;

            logger.LogInformation("[LLM Optimizer] Optimized Result: {Result}", content);

            return content.Trim();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error optimizing prompt with LLM");
            return originalPrompt;
        }
    }
}
