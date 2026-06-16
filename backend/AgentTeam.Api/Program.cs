using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using AgentTeam.Api.Services;
using AgentTeam.Api.WebSockets;
using AgentTeam.Api.Saas;
using AgentTeam.Api.Saas.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.EntityFrameworkCore;

AppDomain.CurrentDomain.UnhandledException += (s, e) =>
{
    var ex = e.ExceptionObject as Exception;
    Console.Error.WriteLine($"[UNHANDLED EXCEPTION] {ex}");
    File.WriteAllText("unhandled_exception.log", ex?.ToString() ?? "Unknown error");
};

var builder = WebApplication.CreateBuilder(args);

// 配置控制台日志
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Debug);

// ─── 服务注册 ─────────────────────────────────────────────────

builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        o.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter());
        o.JsonSerializerOptions.Converters.Add(new UtcDateTimeNullableConverter());
    });

builder.Services.AddOpenApi();

// HttpClient
builder.Services.AddHttpClient();

// SQLite
builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseSqlite($"Data Source={Path.Combine(builder.Environment.ContentRootPath, "data", "agent-team.db")}"));

// SaaS SQLite
builder.Services.AddDbContext<AgentSaasContext>(opts =>
    opts.UseSqlite($"Data Source={Path.Combine(builder.Environment.ContentRootPath, "data", "agent-saas.db")}"));

// SaaS Services
builder.Services.AddSingleton<JwtService>();

// JWT Authentication
var secret = builder.Configuration["Jwt:Secret"] ?? "AntigravitySuperSecretSaaSKey2026!#$@";
var issuer = builder.Configuration["Jwt:Issuer"] ?? "AgentTeamSaas";
var audience = builder.Configuration["Jwt:Audience"] ?? "AgentTeamSaasUsers";

builder.Services.AddAuthentication(opts =>
{
    opts.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    opts.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(opts =>
{
    opts.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = issuer,
        ValidAudience = audience,
        IssuerSigningKey = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(secret))
    };
});

// 核心服务 - 使用显式注入
builder.Services.AddSingleton<OutputFileService>();
builder.Services.AddSingleton<ClaudeCodeService>();
builder.Services.AddSingleton<TaskWebSocketManager>();
builder.Services.AddSingleton<AgentTeam.Api.Services.PermissionHookService>();
builder.Services.AddSingleton<GitService>();
builder.Services.AddSingleton<TerminalService>();
builder.Services.AddSingleton<WeChatBridgeService>(); // 新增
builder.Services.AddScoped<MessageRouterService>();
builder.Services.AddScoped<MessageIngestionService>();
builder.Services.AddSingleton<ButlerMemoryService>();

// 会话清理后台服务：定时扫描超过48小时无新任务的会话，标记为待删除
builder.Services.AddHostedService<SessionCleanupBackgroundService>();

// CORS
builder.Services.AddCors(opts =>
    opts.AddDefaultPolicy(p =>
    {
        var origins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
        p.WithOrigins(origins)
         .AllowAnyHeader()
         .AllowAnyMethod();
    }));

var app = builder.Build();

// ─── 数据库初始化 ──────────────────────────────────────────────

using (var scope = app.Services.CreateScope())
{
    var dbCtx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    Directory.CreateDirectory(Path.Combine(app.Environment.ContentRootPath, "data", "outputs"));
    Directory.CreateDirectory(Path.Combine(app.Environment.ContentRootPath, "data", "sessions"));
    dbCtx.Database.Migrate();

    var saasDbCtx = scope.ServiceProvider.GetRequiredService<AgentSaasContext>();
    saasDbCtx.Database.Migrate();

    // 清理上次非正常关闭导致卡住的任务
    var claudeServiceStartup = scope.ServiceProvider.GetRequiredService<ClaudeCodeService>();
    await claudeServiceStartup.CleanupStuckTasksAsync();
}

// ─── 中间件与路由 ──────────────────────────────────────────────

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

var wsManager = app.Services.GetRequiredService<TaskWebSocketManager>();
var claudeService = app.Services.GetRequiredService<ClaudeCodeService>();
var wechatBridge = app.Services.GetRequiredService<WeChatBridgeService>(); // 新增
var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

claudeService.OnOutput += async (taskId, content) =>
{
    var msg = JsonSerializer.Serialize(new { type = "output", taskId, content }, jsonOptions);
    await wsManager.BroadcastAsync(taskId, msg);
};

claudeService.OnStatusChanged += async (taskId, status) =>
{
    var msg = JsonSerializer.Serialize(new { type = "status", taskId, status }, jsonOptions);
    await wsManager.BroadcastAsync(taskId, msg);

    // 微信集成：当任务状态变化时自动反馈
    _ = Task.Run(async () =>
    {
        try
        {
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var wechatBridge = scope.ServiceProvider.GetRequiredService<WeChatBridgeService>();
            var incoming = await db.IncomingMessages.FirstOrDefaultAsync(m => m.TriggeredTaskId == taskId);

            if (incoming == null || !string.Equals(incoming.Source, "WeChat", StringComparison.OrdinalIgnoreCase) || string.IsNullOrEmpty(incoming.SourceMessageId))
                return;

            if (status == "Running")
            {
                await wechatBridge.SendMessageAsync(incoming.SourceMessageId, "⏳ Agent 已接收任务，开始深度处理中...");

                // 任务执行期间定期轮询输出文件，发送进度反馈到微信
                _ = Task.Run(async () =>
                {
                    try
                    {
                        long lastPosition = 0;
                        int consecutiveErrors = 0;

                        while (consecutiveErrors < 3)
                        {
                            await Task.Delay(TimeSpan.FromSeconds(25));

                            using var pollScope = app.Services.CreateScope();
                            var pollDb = pollScope.ServiceProvider.GetRequiredService<AppDbContext>();
                            var pollWechat = pollScope.ServiceProvider.GetRequiredService<WeChatBridgeService>();
                            var task = await pollDb.Tasks.FindAsync(taskId);
                            if (task == null || task.Status != AgentTeam.Api.Models.TaskStatus.Running) break;

                            // 检查输出文件是否有新内容
                            if (!string.IsNullOrEmpty(task.OutputFilePath) && File.Exists(task.OutputFilePath))
                            {
                                var fileInfo = new FileInfo(task.OutputFilePath);
                                if (fileInfo.Length <= lastPosition) continue; // 无新内容

                                // 读取新增内容
                                using var fs = new FileStream(task.OutputFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                                fs.Seek(lastPosition, SeekOrigin.Begin);
                                using var reader = new StreamReader(fs);
                                var newContent = await reader.ReadToEndAsync();

                                if (string.IsNullOrWhiteSpace(newContent))
                                {
                                    lastPosition = fileInfo.Length;
                                    continue;
                                }

                                // 过滤 ANSI 转义序列
                                var cleanText = Regex.Replace(newContent, @"\x1B\[[^@-~]*[@-~]", "");

                                // 提取关键信息：工具调用、文件操作、错误提示
                                var toolCalls = Regex.Matches(cleanText, @"\[Claude 正在调用工具:\s*([^\]]+)\]");
                                var errorLines = Regex.Matches(cleanText, @"(Error|Failed|Exception|错误|失败)");

                                string progressText;
                                if (toolCalls.Count > 0)
                                {
                                    // 提取最近几个工具调用
                                    var recentTools = toolCalls.TakeLast(2).Select(m => m.Groups[1].Value.Trim()).Distinct().ToList();
                                    progressText = $"🔄 正在执行：{string.Join(" → ", recentTools)}";
                                }
                                else if (errorLines.Count > 0)
                                {
                                    var snippet = cleanText.Trim();
                                    if (snippet.Length > 150) snippet = snippet[..147] + "...";
                                    progressText = $"⚠️ 执行中发现异常：\n{snippet}";
                                }
                                else
                                {
                                    // 通用进度：仅在有显著新内容时发送
                                    var lineCount = cleanText.Split('\n', StringSplitOptions.RemoveEmptyEntries).Length;
                                    if (lineCount < 3) { lastPosition = fileInfo.Length; continue; }
                                    progressText = $"🔄 Agent 正在处理中...（已运行 {Math.Round((DateTime.UtcNow - (task.StartedAt ?? DateTime.UtcNow)).TotalMinutes, 1)} 分钟）";
                                }

                                await pollWechat.SendMessageAsync(incoming.SourceMessageId, progressText);
                                lastPosition = fileInfo.Length;
                            }

                            consecutiveErrors = 0;
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[WeChat Progress Poll Error] {ex.Message}");
                    }
                });
            }
            else if (status == "Completed")
            {
                var task = await db.Tasks.FindAsync(taskId);
                if (task != null && !string.IsNullOrEmpty(task.OutputFilePath) && File.Exists(task.OutputFilePath))
                {
                    var content = await File.ReadAllTextAsync(task.OutputFilePath);
                    var cleanText = Regex.Replace(content, @"\x1B\[[^@-~]*[@-~]", "");
                    // 微信单条消息限制约 2000 字，智能截断并提示
                    var replyText = cleanText.Length > 1900
                        ? $"{cleanText[..1800]}\n\n...（内容过长已截断，完整结果请在前端查看）"
                        : cleanText;
                    await wechatBridge.SendMessageAsync(incoming.SourceMessageId, $"✅ 任务处理完成：\n\n{replyText}");
                }
                else
                {
                    await wechatBridge.SendMessageAsync(incoming.SourceMessageId, "✅ 任务处理完成！（无文本输出）");
                }
            }
            else if (status == "Failed")
            {
                await wechatBridge.SendMessageAsync(incoming.SourceMessageId, "❌ 抱歉，Agent 在执行任务时遇到了错误，处理已终止。");
            }
            else if (status == "Cancelled")
            {
                await wechatBridge.SendMessageAsync(incoming.SourceMessageId, "⛔ 任务已被取消。");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WeChat Callback Error] {ex.Message}");
        }
    });
};

claudeService.OnAskUserQuestion += async (taskId, question, requestId) =>
{
    var msg = JsonSerializer.Serialize(new { type = "ask_user_question", taskId, question, requestId }, jsonOptions);
    await wsManager.BroadcastAsync(taskId, msg);
};

app.Map("/ws/task/{taskId:guid}", async (HttpContext context, Guid taskId) =>
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = 400;
        return;
    }
    var socket = await context.WebSockets.AcceptWebSocketAsync();
    await wsManager.HandleAsync(taskId, socket);
});

app.MapControllers();
try
{
    Console.WriteLine("Backend is running on http://0.0.0.0:5501 ...");
    app.Run("http://0.0.0.0:5501");
}
catch (Exception ex)
{
    Console.Error.WriteLine($"[FATAL CRASH] {ex}");
    File.WriteAllText("fatal_crash.log", ex.ToString());
    throw;
}

// ─── 自定义 DateTime 序列化器：确保 UTC 时间带上 Z 标记 ─────────

/// <summary>
/// 将 DateTime 序列化为 ISO 8601 格式，始终带 Z 标记（视为 UTC）。
/// SQLite 读取的 DateTime.Kind 为 Unspecified，此转换器确保输出带时区标记。
/// </summary>
public class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return DateTime.Parse(reader.GetString()!, null, System.Globalization.DateTimeStyles.RoundtripKind);
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var utcValue = value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        writer.WriteStringValue(utcValue);
    }
}

/// <summary>
/// 将 DateTime? 序列化为 ISO 8601 格式，始终带 Z 标记（视为 UTC）。
/// </summary>
public class UtcDateTimeNullableConverter : JsonConverter<DateTime?>
{
    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var s = reader.GetString();
        if (string.IsNullOrEmpty(s)) return null;
        return DateTime.Parse(s, null, System.Globalization.DateTimeStyles.RoundtripKind);
    }

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        if (!value.HasValue) { writer.WriteNullValue(); return; }
        var utcValue = value.Value.Kind == DateTimeKind.Utc ? value.Value : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
        writer.WriteStringValue(utcValue);
    }
}
