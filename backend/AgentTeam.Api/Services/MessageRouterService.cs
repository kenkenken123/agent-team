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

        var prompt = $@"你是一个智能分发器。根据以下消息内容，判断是否有合适的 Agent 处理，并尝试提取其中包含的本地文件路径（工作目录）。
如果有合适的 Agent，返回 JSON 格式: {{""agentId"": ""..."", ""reason"": ""..."", ""workingDirectory"": ""提取到的路径或 null""}}
如果没有合适的 Agent，返回 JSON 格式: {{""agentId"": null, ""reason"": ""没找到合适的 Agent"", ""workingDirectory"": null}}

注意：
1. 路径提取应包含盘符和文件夹（如 D:\project\foo）。
2. 不要强行分配 Agent。
3. 请确保返回的是纯 JSON，不要包含任何 markdown 标记。

可用的 Agent 列表：
{JsonSerializer.Serialize(agentContext, new JsonSerializerOptions { WriteIndented = true })}

消息内容：
{messageText}";

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
}
