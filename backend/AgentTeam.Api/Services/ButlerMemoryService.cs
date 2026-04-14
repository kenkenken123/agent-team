using System.Text.Json;
using System.Text.Json.Serialization;
using System.Net.Http.Json;
using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Services;

public class ButlerMemoryService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ButlerMemoryService> _logger;
    private readonly string _memoriesDir;
    private readonly string _shortTermPath;
    private readonly string _userProfilePath;

    public ButlerMemoryService(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<ButlerMemoryService> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        
        // Ensure directory exists
        _memoriesDir = Path.Combine(Directory.GetCurrentDirectory(), ".memories");
        if (!Directory.Exists(_memoriesDir))
            Directory.CreateDirectory(_memoriesDir);
            
        _shortTermPath = Path.Combine(_memoriesDir, "butler_short_term.json");
        _userProfilePath = Path.Combine(_memoriesDir, "user_profile.json");
    }

    public class ShortTermMemoryItem
    {
        public string Role { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    public async Task AddShortTermMemoryAsync(string role, string content)
    {
        try
        {
            var memories = await GetShortTermMemoriesAsync();
            memories.Add(new ShortTermMemoryItem { Role = role, Content = content });
            
            // Keep only the last 10 memory items (5 interactions)
            if (memories.Count > 10)
            {
                memories = memories.Skip(memories.Count - 10).ToList();
            }

            await File.WriteAllTextAsync(_shortTermPath, JsonSerializer.Serialize(memories, new JsonSerializerOptions { WriteIndented = true }));
            
            // Evaluate every 5th complete interaction (user+assistant = 1 interaction)
            // We can just keep a simple counter file.
            var counterPath = Path.Combine(_memoriesDir, "cycle_counter.txt");
            int counter = 0;
            if (File.Exists(counterPath)) int.TryParse(File.ReadAllText(counterPath), out counter);
            
            counter++;
            await File.WriteAllTextAsync(counterPath, counter.ToString());

            // Since user+assistant = 2 messages per interaction, 5 interactions = 10 messages
            if (counter >= 10)
            {
                // Reset and trigger
                await File.WriteAllTextAsync(counterPath, "0");
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await PeriodicEvaluationAsync();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error in PeriodicEvaluationAsync trigger");
                    }
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding short term memory");
        }
    }

    public async Task<List<ShortTermMemoryItem>> GetShortTermMemoriesAsync()
    {
        if (!File.Exists(_shortTermPath)) return new List<ShortTermMemoryItem>();
        try
        {
            var content = await File.ReadAllTextAsync(_shortTermPath);
            return JsonSerializer.Deserialize<List<ShortTermMemoryItem>>(content) ?? new List<ShortTermMemoryItem>();
        }
        catch
        {
            return new List<ShortTermMemoryItem>();
        }
    }

    public async Task<string> GetUserProfileAsync()
    {
        if (!File.Exists(_userProfilePath)) return "{}";
        try
        {
            return await File.ReadAllTextAsync(_userProfilePath);
        }
        catch
        {
            return "{}";
        }
    }

    public async Task SaveUserProfileAsync(string profileJson)
    {
        await File.WriteAllTextAsync(_userProfilePath, profileJson);
    }

    public async Task<string> GetMemoryContextAsync(bool excludeLastUserMessage = false)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        
        var longTermMemories = await db.Memories.OrderByDescending(m => m.CreatedAt).ToListAsync();
        var userProfile = await GetUserProfileAsync();
        var shortTermMemories = await GetShortTermMemoriesAsync();

        if (excludeLastUserMessage && shortTermMemories.Count > 0 && shortTermMemories.Last().Role == "user")
        {
            shortTermMemories = shortTermMemories.Take(shortTermMemories.Count - 1).ToList();
        }

        var contextBuilder = new System.Text.StringBuilder();
        
        contextBuilder.AppendLine("【用户画像】");
        contextBuilder.AppendLine(userProfile);
        contextBuilder.AppendLine();

        contextBuilder.AppendLine("【长期记忆（事实标准、偏好、经验）】");
        if (longTermMemories.Count == 0) contextBuilder.AppendLine("暂无长期记忆。");
        foreach (var m in longTermMemories)
        {
            contextBuilder.AppendLine($"- [{m.Id}] {m.Content}");
        }
        contextBuilder.AppendLine();

        contextBuilder.AppendLine("【最近短期交互】");
        if (shortTermMemories.Count == 0) contextBuilder.AppendLine("暂无近期交互。");
        foreach (var m in shortTermMemories)
        {
            contextBuilder.AppendLine($"{m.Role}: {m.Content}");
        }

        return contextBuilder.ToString();
    }

    public async Task ImmediateEvaluationAsync(string userPrompt, string agentFinalAnswer)
    {
        // 记录助手（Agent）的最终回答到短期记忆
        await AddShortTermMemoryAsync("assistant", agentFinalAnswer);

        var prompt = $@"请评估刚才的用户指令与具体的执行结果，判断是否需要更新沉淀长期记忆库或用户个人画像。
如果有，请调用对应的工具（add_memory, replace_memory, remove_memory, update_user_profile）来保存。

【核心筛选原则】：
1. 长期记忆**仅关注通用性强**的偏好、习惯或跨会话底层架构规则（如“xx项目代码路径在 d:\foo”、“某个项目的专有命令”、“用户喜欢深色设计”等）。
2. 特别关注与“路由切换和任务分配”相关的经验。若对话揭示了某种任务应该由哪个具体的逻辑处理，或某类框架需要怎么配工作目录，请沉淀下来。
3. **绝对不要**记录临时的、碎片化的、只在本次对话中有用的详情（例如：“Agent帮我修复了一个xxx bug”，“刚才创建了 yyy.cs 文件”等一次性流水账）。
4. 若毫无通用长期价值，请不要调用任何工具，直接返回空！

当前用户提问: {userPrompt}
Agent返回结果/回答: {agentFinalAnswer}";

        await EvaluateWithLLMAsync(prompt);
    }

    public async Task PeriodicEvaluationAsync()
    {
        var memories = await GetShortTermMemoriesAsync();
        if (memories.Count == 0) return;

        var history = string.Join("\n", memories.Select(m => $"{m.Role}: {m.Content}"));
        var prompt = $@"以下是最近的一连串连贯对话历史。请综合评估这段对话中是否包含值得提炼为通用长期记忆或更新用户个人画像的要点。
若有，请调用工具（add_memory, replace_memory, update_user_profile等）将其整合记录下来。

【归纳与提炼原则】：
1. 提取能在别的会话中**通用**的经验：如业务核心流、宏观项目路径、核心配置文件位置、通用工作习惯等。
2. 重点归纳未来可协助“管家智能路由分配 Agent”的经验规则（例如某种任务的固定分配对象）。
3. 彻底丢弃那些仅针对本次聊天的代码分析、具体的临时错误排查步骤、修改某一行代码的情节等。
4. 如果没有上述通用价值维度，绝不要盲目调用工具添加无价值记忆。

近期对话历史：
{history}";

        await EvaluateWithLLMAsync(prompt);
    }

    private async Task EvaluateWithLLMAsync(string prompt)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var baseUrlSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.baseUrl");
        var apiKeySetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.apiKey");
        var modelIdSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "router.llm.modelId");

        var baseUrl = baseUrlSetting?.Value ?? "https://api.openai.com/v1";
        var apiKey = apiKeySetting?.Value;
        var modelId = modelIdSetting?.Value ?? "gpt-4o-mini";

        if (string.IsNullOrEmpty(apiKey))
        {
            _logger.LogWarning("LLM API Key not configured. Skipping memory evaluation.");
            return;
        }

        var currentProfile = await GetUserProfileAsync();
        var longTermMemories = await db.Memories.ToListAsync();
        var currentMemoriesStr = string.Join("\n", longTermMemories.Select(m => $"ID: {m.Id} | {m.Content}"));

        var systemPrompt = $@"你是一个高维度的智能记忆管家。你的唯一职责是从错综复杂的对话场景中，提取跨会话通用的关键规则、路由分发依据、项目结构抽象和用户的底层偏好。
你**禁止**将单次沟通的具体对话细节、一时的 Bug 解决对白、零碎的文件创建流水作为记忆保存下来。记忆必须是【高度提纯的宏观法则】，用以直接指导未来的 Agent 路由、Prompt 补全组装。

现有内存中长期记忆：
{currentMemoriesStr}

当前用户画像JSON：
{currentProfile}

你可以随时使用工具新增、替换由于规则改变而冲突的记忆，保持记忆库的通用、稳定与精简。";

        var tools = new object[]
        {
            new
            {
                type = "function",
                function = new
                {
                    name = "add_memory",
                    description = "添加新的单条长期记忆，不超过2000字，需将信息压缩合并。",
                    parameters = new
                    {
                        type = "object",
                        properties = new
                        {
                            content = new { type = "string", description = "记忆内容" }
                        },
                        required = new[] { "content" }
                    }
                }
            },
            new
            {
                type = "function",
                function = new
                {
                    name = "replace_memory",
                    description = "修改或替换一条旧有的长期记忆。当与原记忆冲突或可合并时使用。",
                    parameters = new
                    {
                        type = "object",
                        properties = new
                        {
                            id = new { type = "string", description = "需要替换的记忆ID" },
                            newContent = new { type = "string", description = "新的合并压缩后的内容" }
                        },
                        required = new[] { "id", "newContent" }
                    }
                }
            },
            new
            {
                type = "function",
                function = new
                {
                    name = "remove_memory",
                    description = "删除一条过时或错误的长期记忆。",
                    parameters = new
                    {
                        type = "object",
                        properties = new
                        {
                            id = new { type = "string", description = "需要删除的记忆ID" }
                        },
                        required = new[] { "id" }
                    }
                }
            },
            new
            {
                type = "function",
                function = new
                {
                    name = "update_user_profile",
                    description = "更新用户画像的 JSON 结构，覆盖式的写入新的 JSON 文本。",
                    parameters = new
                    {
                        type = "object",
                        properties = new
                        {
                            profileJson = new { type = "string", description = "最新的完整用户画像 JSON 字符串" }
                        },
                        required = new[] { "profileJson" }
                    }
                }
            }
        };

        try
        {
            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

            var requestBody = new
            {
                model = modelId,
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = prompt }
                },
                tools = tools,
                tool_choice = "auto"
            };

            var response = await client.PostAsJsonAsync($"{baseUrl.TrimEnd('/')}/chat/completions", requestBody);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("LLM evaluation API call failed: {Status}", response.StatusCode);
                return;
            }

            var result = await response.Content.ReadFromJsonAsync<JsonElement>();
            if (result.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
            {
                var message = choices[0].GetProperty("message");
                if (message.TryGetProperty("tool_calls", out var toolCalls))
                {
                    foreach (var tc in toolCalls.EnumerateArray())
                    {
                        var func = tc.GetProperty("function");
                        var name = func.GetProperty("name").GetString();
                        var argsStr = func.GetProperty("arguments").GetString();
                        if (name != null && argsStr != null)
                        {
                            await HandleToolCallAsync(name, argsStr);
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in EvaluateWithLLMAsync");
        }
    }

    private async Task HandleToolCallAsync(string name, string arguments)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        try
        {
            using var doc = JsonDocument.Parse(arguments);
            var root = doc.RootElement;

            switch (name)
            {
                case "add_memory":
                    if (root.TryGetProperty("content", out var c))
                    {
                        db.Memories.Add(new LongTermMemory { Content = c.GetString() ?? "" });
                        await db.SaveChangesAsync();
                        _logger.LogInformation("Added new memory");
                    }
                    break;
                case "replace_memory":
                    if (root.TryGetProperty("id", out var idEl) && root.TryGetProperty("newContent", out var ncEl))
                    {
                        if (Guid.TryParse(idEl.GetString(), out var id))
                        {
                            var mem = await db.Memories.FindAsync(id);
                            if (mem != null)
                            {
                                mem.Content = ncEl.GetString() ?? "";
                                mem.UpdatedAt = DateTime.UtcNow;
                                await db.SaveChangesAsync();
                                _logger.LogInformation("Replaced memory {Id}", id);
                            }
                        }
                    }
                    break;
                case "remove_memory":
                    if (root.TryGetProperty("id", out var ridEl))
                    {
                        if (Guid.TryParse(ridEl.GetString(), out var rid))
                        {
                            var mem = await db.Memories.FindAsync(rid);
                            if (mem != null)
                            {
                                db.Memories.Remove(mem);
                                await db.SaveChangesAsync();
                                _logger.LogInformation("Removed memory {Id}", rid);
                            }
                        }
                    }
                    break;
                case "update_user_profile":
                    if (root.TryGetProperty("profileJson", out var pj))
                    {
                        await SaveUserProfileAsync(pj.GetString() ?? "{}");
                        _logger.LogInformation("Updated user profile");
                    }
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute memory tool: {ToolName}", name);
        }
    }
}
