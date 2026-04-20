using System.Collections.Concurrent;
using System.Text.Json;
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

    /// <summary>
    /// 每个 Agent 的写入锁，防止并发写入导致数据丢失或损坏
    /// </summary>
    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _agentLocks = new();

    /// <summary>
    /// 全局短期记忆写入锁
    /// </summary>
    private readonly SemaphoreSlim _shortTermLock = new(1, 1);

    /// <summary>
    /// HttpClient 重试次数（网络波动时自动重试）
    /// </summary>
    private const int MaxRetries = 2;

    /// <summary>
    /// 长期记忆最大字符数
    /// </summary>
    private const int LongTermMemoryMaxChars = 2200;

    /// <summary>
    /// 短期记忆每条内容最大字符数（超出时截断）
    /// </summary>
    private const int ShortTermMemoryItemMaxChars = 500;

    /// <summary>
    /// 短期记忆最大条目数
    /// 默认保留最近 5 条交互记录，平衡上下文质量与 Token 消耗
    /// </summary>
    private const int ShortTermMemoryMaxItems = 5;

    /// <summary>
    /// Agent 专属短期记忆最大条目数
    /// 默认保留最近 5 条执行历史，用于 Agent 上下文感
    /// </summary>
    private const int AgentShortTermMemoryMaxItems = 5;

    /// <summary>
    /// 周期评估触发阈值（消息数）
    /// 每 10 条消息触发一次长期记忆评估
    /// </summary>
    private const int PeriodicEvaluationThreshold = 10;

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
        _pendingClarificationPath = Path.Combine(_memoriesDir, "pending_clarification.txt");
    }

    private readonly string _pendingClarificationPath;

    private string GetAgentShortTermPath(Guid agentId) 
        => Path.Combine(_memoriesDir, $"agent_{agentId}_short_term.json");

    public class ShortTermMemoryItem
    {
        public string Role { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// 添加短期记忆，自动截断过长内容
    /// </summary>
    public async Task AddShortTermMemoryAsync(string role, string content)
    {
        await _shortTermLock.WaitAsync();
        try
        {
            // 截断过长内容
            if (content.Length > ShortTermMemoryItemMaxChars)
            {
                content = TruncateContent(content, ShortTermMemoryItemMaxChars);
            }

            var memories = await GetShortTermMemoriesAsync();
            memories.Add(new ShortTermMemoryItem { Role = role, Content = content, Timestamp = DateTime.UtcNow });

            // Keep only the last N memory items
            if (memories.Count > ShortTermMemoryMaxItems)
            {
                memories = memories.Skip(memories.Count - ShortTermMemoryMaxItems).ToList();
            }

            await File.WriteAllTextAsync(_shortTermPath, JsonSerializer.Serialize(memories, new JsonSerializerOptions { WriteIndented = true }));

            // Evaluate every Nth message
            var counterPath = Path.Combine(_memoriesDir, "cycle_counter.txt");
            int counter = 0;
            if (File.Exists(counterPath)) int.TryParse(File.ReadAllText(counterPath), out counter);

            counter++;
            await File.WriteAllTextAsync(counterPath, counter.ToString());

            if (counter >= PeriodicEvaluationThreshold)
            {
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
        finally
        {
            _shortTermLock.Release();
        }
    }

    /// <summary>
    /// 截断内容，保留开头和结尾，中间用省略标记
    /// </summary>
    private string TruncateContent(string content, int maxChars)
    {
        if (content.Length <= maxChars) return content;

        // 保留开头 60% 和结尾 30%，中间用 "...[已截断]..." 连接
        var headLen = (int)(maxChars * 0.65);
        var tailLen = (int)(maxChars * 0.30);
        var separator = "...[已截断]...";
        var separatorLen = separator.Length;

        // 调整确保总长度不超
        headLen = Math.Min(headLen, maxChars - tailLen - separatorLen);
        tailLen = Math.Min(tailLen, maxChars - headLen - separatorLen);

        return content.Substring(0, headLen) + separator + content.Substring(content.Length - tailLen);
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

    /// <summary>
    /// 获取唯一的长期记忆（单条模式）
    /// </summary>
    public async Task<LongTermMemory?> GetSingleLongTermMemoryAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Memories.FirstOrDefaultAsync();
    }

    /// <summary>
    /// 保存或更新唯一的长期记忆（单条模式），超2200字时由LLM压缩
    /// </summary>
    public async Task SaveSingleLongTermMemoryAsync(string content)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // 硬截断保底（LLM压缩后的内容不应超过2200字，但以防万一）
        if (content.Length > LongTermMemoryMaxChars)
        {
            content = content.Substring(0, LongTermMemoryMaxChars);
            _logger.LogWarning("Long term memory truncated to {MaxChars} chars", LongTermMemoryMaxChars);
        }

        var existing = await db.Memories.FirstOrDefaultAsync();
        if (existing == null)
        {
            existing = new LongTermMemory { Content = content };
            db.Memories.Add(existing);
        }
        else
        {
            existing.Content = content;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// 如果长期记忆内容超过2200字，触发LLM压缩
    /// </summary>
    public async Task CompressLongTermMemoryIfNeededAsync()
    {
        var memory = await GetSingleLongTermMemoryAsync();
        if (memory == null || memory.Content.Length <= LongTermMemoryMaxChars) return;

        _logger.LogInformation("Long term memory exceeds {MaxChars} chars ({ActualChars}), triggering LLM compression",
            LongTermMemoryMaxChars, memory.Content.Length);

        var prompt = $@"当前长期记忆内容已超过 {LongTermMemoryMaxChars} 字的限制（实际 {memory.Content.Length} 字）。
请将以下长期记忆内容进行**压缩取舍**，保留最核心、最通用的规则和偏好，丢弃次要和过时的内容。
压缩后的内容必须不超过 {LongTermMemoryMaxChars} 字。

压缩原则：
1. 优先保留：路由分配经验、项目核心路径、用户深层偏好、跨会话通用规则
2. 可以丢弃：过时的项目信息、冗余的重复规则、非常具体的临时配置
3. 合并同类：将多条相似规则合并为一条精炼的描述

当前长期记忆内容：
{memory.Content}

请调用 update_long_term_memory 工具，传入压缩后的完整内容。";

        await EvaluateWithLLMAsync(prompt, forceToolCall: true);
    }

    public async Task<string> GetMemoryContextAsync(bool excludeLastUserMessage = false)
    {
        var longTermMemory = await GetSingleLongTermMemoryAsync();
        var userProfile = await GetUserProfileAsync();
        var shortTermMemories = await GetShortTermMemoriesAsync();

        if (excludeLastUserMessage && shortTermMemories.Count > 0 && shortTermMemories.Last().Role == "user")
        {
            shortTermMemories = shortTermMemories.Take(shortTermMemories.Count - 1).ToList();
        }

        var contextBuilder = new System.Text.StringBuilder();

        // 优化顺序：用户画像 -> 长期记忆 -> 短期记忆 (利于 Token Cache)
        contextBuilder.AppendLine("【用户画像】");
        if (string.IsNullOrWhiteSpace(userProfile) || userProfile == "{}")
        {
            contextBuilder.AppendLine("（暂无用户画像数据，需要从对话中提取并建立）");
        }
        else
        {
            contextBuilder.AppendLine(userProfile);
        }
        contextBuilder.AppendLine();

        contextBuilder.AppendLine("【长期记忆（事实标准、偏好、经验）】");
        if (longTermMemory == null)
        {
            contextBuilder.AppendLine("暂无长期记忆。");
        }
        else
        {
            contextBuilder.AppendLine(longTermMemory.Content);
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

    /// <summary>
    /// 获取 Agent 专属的上下文记忆 (最近5条)
    /// </summary>
    public async Task<string> GetAgentContextAsync(Guid agentId)
    {
        var memories = await GetAgentShortTermMemoriesAsync(agentId);
        if (memories.Count == 0) return "暂无该 Agent 的近期执行历史。";

        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"【Agent 专属执行历史 (最近{AgentShortTermMemoryMaxItems}条)】");
        foreach (var m in memories)
        {
            sb.AppendLine($"{m.Role}: {m.Content}");
        }
        return sb.ToString();
    }

    public async Task AddAgentShortTermMemoryAsync(Guid agentId, string role, string content)
    {
        // 获取或创建该 Agent 的专属锁
        var agentLock = _agentLocks.GetOrAdd(agentId, _ => new SemaphoreSlim(1, 1));
        await agentLock.WaitAsync();
        try
        {
            if (content.Length > ShortTermMemoryItemMaxChars)
                content = TruncateContent(content, ShortTermMemoryItemMaxChars);

            var path = GetAgentShortTermPath(agentId);
            List<ShortTermMemoryItem> memories;
            if (File.Exists(path))
            {
                var json = await File.ReadAllTextAsync(path);
                memories = JsonSerializer.Deserialize<List<ShortTermMemoryItem>>(json) ?? new List<ShortTermMemoryItem>();
            }
            else memories = new List<ShortTermMemoryItem>();

            memories.Add(new ShortTermMemoryItem { Role = role, Content = content, Timestamp = DateTime.UtcNow });

            if (memories.Count > AgentShortTermMemoryMaxItems)
            {
                memories = memories.Skip(memories.Count - AgentShortTermMemoryMaxItems).ToList();
            }

            await File.WriteAllTextAsync(path, JsonSerializer.Serialize(memories, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding agent short term memory for {AgentId}", agentId);
        }
        finally
        {
            agentLock.Release();
            // 如果该 Agent 的锁不再被等待且没有其他 Agent 在排队，可以清理
            _agentLocks.TryRemove(agentId, out _);
        }
    }

    public async Task<List<ShortTermMemoryItem>> GetAgentShortTermMemoriesAsync(Guid agentId)
    {
        var path = GetAgentShortTermPath(agentId);
        if (!File.Exists(path)) return new List<ShortTermMemoryItem>();
        try
        {
            var content = await File.ReadAllTextAsync(path);
            return JsonSerializer.Deserialize<List<ShortTermMemoryItem>>(content) ?? new List<ShortTermMemoryItem>();
        }
        catch
        {
            return new List<ShortTermMemoryItem>();
        }
    }

    public async Task SavePendingClarificationAsync(string originalQuestion)
    {
        await File.WriteAllTextAsync(_pendingClarificationPath, originalQuestion);
    }

    public async Task<string?> GetPendingClarificationAsync()
    {
        if (!File.Exists(_pendingClarificationPath)) return null;
        return await File.ReadAllTextAsync(_pendingClarificationPath);
    }

    public async Task ClearPendingClarificationAsync()
    {
        if (File.Exists(_pendingClarificationPath)) File.Delete(_pendingClarificationPath);
    }

    public async Task ImmediateEvaluationAsync(string userPrompt, string agentFinalAnswer)
    {
        // 记录助手的最终回答到短期记忆（已自动截断）
        await AddShortTermMemoryAsync("assistant", agentFinalAnswer);

        var prompt = $@"请评估刚才的用户指令与具体的执行结果，判断是否需要更新长期记忆或用户画像。

【核心筛选原则】：
1. 长期记忆**仅关注通用性强**的偏好、习惯或跨会话底层架构规则（如""xx项目代码路径在 d:\foo""、""某个项目的专有命令""、""用户喜欢深色设计""等）。
2. 特别关注与""路由切换和任务分配""相关的经验。若对话揭示了某种任务应该由哪个具体的逻辑处理，或某类框架需要怎么配工作目录，请沉淀下来。
3. **绝对不要**记录临时的、碎片化的、只在本次对话中有用的详情（例如：""Agent帮我修复了一个xxx bug""，""刚才创建了 yyy.cs 文件""等一次性流水账）。
4. 若毫无通用长期价值，请不要调用任何长期记忆工具，直接返回空！

【用户画像必须提取原则】：
1. 任何对话都可能包含用户画像信息：技术偏好、使用习惯、项目偏好、常用命令、工作风格等
2. 即使只有微小的画像更新（如发现用户偏好某个框架），也必须调用 update_user_profile 更新
3. 用户画像 JSON 结构应包含：preferences（偏好）、skills（技能领域）、projectContext（项目上下文）、routingRules（路由规则）、habits（工作习惯）
4. 如果当前画像为空，务必从对话中建立初始画像

当前用户提问: {userPrompt}
Agent返回结果/回答: {agentFinalAnswer}";

        await EvaluateWithLLMAsync(prompt);

        // 评估后检查长期记忆是否超限，需要压缩
        await CompressLongTermMemoryIfNeededAsync();
    }

    public async Task PeriodicEvaluationAsync()
    {
        var memories = await GetShortTermMemoriesAsync();
        if (memories.Count == 0) return;

        var history = string.Join("\n", memories.Select(m => $"{m.Role}: {m.Content}"));
        var prompt = $@"以下是最近的一连串连贯对话历史。请综合评估这段对话中是否包含值得提炼为通用长期记忆或更新用户个人画像的要点。

【归纳与提炼原则】：
1. 提取能在别的会话中**通用**的经验：如业务核心流、宏观项目路径、核心配置文件位置、通用工作习惯等。
2. 重点归纳未来可协助""管家智能路由分配 Agent""的经验规则（例如某种任务的固定分配对象）。
3. 彻底丢弃那些仅针对本次聊天的代码分析、具体的临时错误排查步骤、修改某一行代码的情节等。
4. 如果没有上述通用价值维度，绝不要盲目调用长期记忆工具添加无价值记忆。

【用户画像必须提取原则】：
1. 从对话历史中提取用户画像维度信息：技术栈偏好、工作习惯、项目上下文、路由分配经验
2. 即使只有微小更新，也必须调用 update_user_profile 累积更新
3. 不要让用户画像长期为空

近期对话历史：
{history}";

        await EvaluateWithLLMAsync(prompt);

        // 评估后检查长期记忆是否超限，需要压缩
        await CompressLongTermMemoryIfNeededAsync();
    }

    /// <summary>
    /// 通用LLM评估方法，支持强制工具调用模式
    /// </summary>
    private async Task EvaluateWithLLMAsync(string prompt, bool forceToolCall = false)
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
        var longTermMemory = await GetSingleLongTermMemoryAsync();
        var currentMemoryStr = longTermMemory != null
            ? $"现有长期记忆（单条，限{LongTermMemoryMaxChars}字）：\n{longTermMemory.Content}"
            : "暂无长期记忆。";

        var systemPrompt = $@"你是一个高维度的智能记忆管家。你的唯一职责是从错综复杂的对话场景中，提取跨会话通用的关键规则、路由分发依据、项目结构抽象和用户的底层偏好。
你**禁止**将单次沟通的具体对话细节、一时的 Bug 解决对白、零碎的文件创建流水作为记忆保存下来。记忆必须是【高度提纯的宏观法则】，用以直接指导未来的 Agent 路由、Prompt 补全组装。

【长期记忆规则 - 极其重要】：
- 系统只维护【1条】长期记忆，不超过{LongTermMemoryMaxChars}字
- 新增信息必须与现有记忆合并（调用 update_long_term_memory），而不是 add_memory
- 只有在确实没有任何长期记忆时，才使用 add_memory 创建第一条
- 合并时需取舍：优先保留路由规则、核心偏好、通用架构规则；丢弃过时、冗余、碎片化信息

【用户画像规则 - 极其重要】：
- 用户画像必须从每次对话中提取和累积更新
- 画像JSON结构必须包含以下字段：
  - preferences: 用户偏好（如主题、代码风格、常用工具）
  - skills: 技术技能领域（如前端、后端、DevOps）
  - projectContext: 项目上下文（如项目路径、框架、技术栈）
  - routingRules: 路由分配经验（如某类任务应分配给哪个Agent）
  - habits: 工作习惯（如开发流程、沟通风格）
- 不允许用户画像为空或只有""{{}}""，每次评估都必须尝试更新
- 更新画像时必须保留已有信息，只增加或修正，不要丢失已有数据

{currentMemoryStr}

当前用户画像JSON：
{currentProfile}";

        var tools = new object[]
        {
            new
            {
                type = "function",
                function = new
                {
                    name = "add_memory",
                    description = $"创建第一条长期记忆（仅在系统中完全没有任何长期记忆时使用）。内容不超过{LongTermMemoryMaxChars}字，需将信息高度压缩合并。",
                    parameters = new
                    {
                        type = "object",
                        properties = new
                        {
                            content = new { type = "string", description = "记忆内容，不超过2200字" }
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
                    name = "update_long_term_memory",
                    description = $"更新/合并唯一的长期记忆条目。将新信息与已有记忆合并取舍，保留最核心的规则和偏好。这是最常用的长期记忆操作。内容不超过{LongTermMemoryMaxChars}字。",
                    parameters = new
                    {
                        type = "object",
                        properties = new
                        {
                            content = new { type = "string", description = "合并后的完整长期记忆内容，不超过2200字" }
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
                    name = "update_user_profile",
                    description = "更新用户画像的 JSON 结构，覆盖式写入新的完整 JSON 文本。必须保留已有画像数据，只增加或修正。画像结构需包含 preferences、skills、projectContext、routingRules、habits 字段。",
                    parameters = new
                    {
                        type = "object",
                        properties = new
                        {
                            profileJson = new { type = "string", description = "最新的完整用户画像 JSON 字符串，必须包含 preferences、skills、projectContext、routingRules、habits 五个字段" }
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
            client.Timeout = TimeSpan.FromSeconds(120);

            var toolChoice = forceToolCall ? "required" : "auto";

            var requestBody = new
            {
                model = modelId,
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = prompt }
                },
                tools = tools,
                tool_choice = toolChoice
            };

            // 带重试机制的 HTTP 调用（应对网络波动）
            HttpResponseMessage? response = null;
            for (int attempt = 0; attempt <= MaxRetries; attempt++)
            {
                try
                {
                    response = await client.PostAsJsonAsync($"{baseUrl.TrimEnd('/')}/chat/completions", requestBody);
                    if (response.IsSuccessStatusCode) break;

                    var errorBody = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("LLM evaluation API call failed (attempt {Attempt}/{MaxRetries}): {Status}, Body: {Body}",
                        attempt + 1, MaxRetries + 1, response.StatusCode, errorBody);

                    if (attempt < MaxRetries)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt)));
                    }
                    else
                    {
                        return;
                    }
                }
                catch (HttpRequestException ex) when (attempt < MaxRetries)
                {
                    _logger.LogWarning(ex, "LLM evaluation HTTP request failed (attempt {Attempt}/{MaxRetries}), retrying...",
                        attempt + 1, MaxRetries + 1);
                    await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt)));
                }
            }

            if (response == null || !response.IsSuccessStatusCode) return;

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
        try
        {
            using var doc = JsonDocument.Parse(arguments);
            var root = doc.RootElement;

            switch (name)
            {
                case "add_memory":
                    // 仅在无任何长期记忆时创建第一条
                    if (root.TryGetProperty("content", out var c))
                    {
                        await SaveSingleLongTermMemoryAsync(c.GetString() ?? "");
                        _logger.LogInformation("Created first long term memory");
                    }
                    break;

                case "update_long_term_memory":
                    // 合并更新唯一的长期记忆
                    if (root.TryGetProperty("content", out var uc))
                    {
                        await SaveSingleLongTermMemoryAsync(uc.GetString() ?? "");
                        _logger.LogInformation("Updated long term memory (single entry mode)");
                    }
                    break;

                case "update_user_profile":
                    if (root.TryGetProperty("profileJson", out var pj))
                    {
                        var profileJson = pj.GetString() ?? "{}";
                        // 验证JSON格式
                        try
                        {
                            JsonDocument.Parse(profileJson);
                            await SaveUserProfileAsync(profileJson);
                            _logger.LogInformation("Updated user profile");
                        }
                        catch (JsonException ex)
                        {
                            _logger.LogWarning("Invalid user profile JSON received from LLM: {Error}", ex.Message);
                        }
                    }
                    break;

                // 旧工具名兼容处理（replace_memory 和 remove_memory 在单条模式下不再使用）
                case "replace_memory":
                    // 兼容旧逻辑，映射到 update_long_term_memory
                    if (root.TryGetProperty("newContent", out var ncEl))
                    {
                        await SaveSingleLongTermMemoryAsync(ncEl.GetString() ?? "");
                        _logger.LogInformation("Replaced memory via compatibility mapping");
                    }
                    break;

                case "remove_memory":
                    // 单条模式下不支持删除，忽略
                    _logger.LogWarning("remove_memory is not supported in single-entry mode, ignored");
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute memory tool: {ToolName}", name);
        }
    }
}