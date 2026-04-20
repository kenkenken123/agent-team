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

            logger.LogInformation("[LLM Router] Raw Response (truncated & sanitized): {Response}",
                SanitizeForLog(content));

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

        var systemPrompt = @"你是一个资深软件工程师，请根据 Git 变更内容生成规范的 commit message。

请严格遵循 Conventional Commits 规范，并满足以下要求：

【格式要求】
<type>(<scope>): <subject>

<body>

<footer>

【type 必须是以下之一】
- feat: 新功能
- fix: 修复 bug
- docs: 文档变更
- style: 代码格式（不影响逻辑）
- refactor: 重构（非功能/bug变更）
- perf: 性能优化
- test: 测试相关
- build: 构建系统或依赖变更
- ci: CI/CD 相关
- chore: 杂项（不影响 src/test）

【scope 要求】
- 必填，使用小写英文模块名（如 auth, api, ui, db）
- 描述变更影响的主要模块

【subject 要求】
- 必须使用中文描述
- 动词原形开头（如添加、修复、更新、移除、优化）
- 不超过 72 字符
- 不要以句号结尾

【body 要求】
- 复杂改动必须提供 body
- 描述""做了什么""和""为什么这么做""
- 使用中文，用项目符号列出多项变更

【footer 要求】
- 关联 issue（如: Closes #123）
- BREAKING CHANGE 必须显式说明

【额外约束】
- 避免模糊描述（如 update code / fix stuff / 更新代码 / 修复一些问题）
- 不要出现 AI、生成、prompt 等字样
- 输出必须是最终 commit message，不要解释、不要前言、不要 Markdown 标记

只返回最终的 commit message 文本。";

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

    public async Task<string> OptimizePromptAsync(string originalPrompt, Guid? agentId = null)
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
        string agentContext = string.Empty;
        if (agentId.HasValue)
        {
            agentContext = await butlerMemoryService.GetAgentContextAsync(agentId.Value);
        }

        var systemPrompt = $@"你是一个 Prompt 优化专家（管家）。你的任务是结合当前的系统记忆上下文以及（如果有）选定 Agent 的专属历史，优化用户的原始指令，使其更清晰、更具体、更容易被后端的执行 Agent 理解。
保持原始核心意图的基础上：
1. 结合【管家记忆上下文】和【Agent 专属历史】，如果用户提到“那个文件”、“刚才的方法”或缺失了明确的工作目录、文件名，请帮助他直接在 Prompt 中补全这些信息。
2. 明确任务目标。
3. 纠正可能的拼写或逻辑模糊。
4. 如果指令过短或不完整，在明确的记忆参考下补全它。
5. 始终使用中文返回优化后的内容。
6. **只返回优化后的最终指令字符串，不要有其他解释、前言或 Markdown 标签。不要自问自答。**

【管家记忆上下文】
{memoryContext}

{(string.IsNullOrEmpty(agentContext) ? "" : agentContext)}";

        logger.LogInformation("[LLM Optimizer] Request SystemPrompt: {SystemPrompt}", systemPrompt);
        logger.LogInformation("[LLM Optimizer] Request UserPrompt: {UserPrompt}", originalPrompt);

        try
        {
            var client = httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            client.Timeout = TimeSpan.FromSeconds(120);

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

            logger.LogInformation("[LLM Optimizer] Optimized Result (truncated & sanitized): {Result}",
                SanitizeForLog(content));

            return content.Trim();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error optimizing prompt with LLM");
            return originalPrompt;
        }
    }
    public async Task<string> GenerateButlerSummaryAsync(string prompt, string agentResult)
    {
        var baseUrlSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.baseUrl");
        var apiKeySetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.apiKey");
        var modelIdSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.modelId");

        var baseUrl = baseUrlSetting?.Value ?? "https://api.openai.com/v1";
        var apiKey = apiKeySetting?.Value;
        var modelId = modelIdSetting?.Value ?? "gpt-4o-mini";

        if (string.IsNullOrEmpty(apiKey)) return string.Empty;

        var systemPrompt = @"你是一个资深智能管家。请对 Agent 刚执行完的任务结果进行结构化总结。
你必须返回一个合法的 JSON 对象，包含以下字段：
1. summary: (string) 简明扼要的一句话总结 Agent 做了什么。
2. impactScope: (string[]) 影响范围，列出修改或创建的文件路径、影响的模块名等。
3. keyPoints: (string[]) 执行过程中的核心要点或关键发现。
4. suggestedNextActions: (string[]) 建议用户的后续操作。

确保内容精炼、专业，使用中文。不要返回任何 Markdown 标记。";

        var userPrompt = $"【用户原始指令】\n{prompt}\n\n【Agent 执行结果】\n{agentResult}";

        try
        {
            var client = httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            client.Timeout = TimeSpan.FromSeconds(120);

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
            if (!response.IsSuccessStatusCode) return string.Empty;

            var result = await response.Content.ReadFromJsonAsync<JsonElement>();
            var content = result.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";

            // 清理 Markdown
            if (content.Contains("```"))
            {
                content = content.Replace("```json", "").Replace("```", "").Trim();
            }

            return content.Trim();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error generating butler summary");
            return string.Empty;
        }
    }

    /// <summary>
    /// 对日志内容进行脱敏和截断，防止敏感信息泄露
    /// </summary>
    private static string SanitizeForLog(string content, int maxLength = 200)
    {
        if (string.IsNullOrEmpty(content)) return "(empty)";
        // 截断过长内容
        var truncated = content.Length > maxLength
            ? content.Substring(0, maxLength) + "..."
            : content;
        // 移除可能的 API Key 模式（如 sk-xxx）
        return System.Text.RegularExpressions.Regex.Replace(
            truncated,
            @"(sk-|Bearer\s+|api[-_]?key[:=]\s*)[A-Za-z0-9]{8,}",
            "$1***REDACTED***",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    }
}
