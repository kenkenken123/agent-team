using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using AgentTeam.Api.Data;
using AgentTeam.Api.Services;
using AgentTeam.Api.WebSockets;
using Microsoft.EntityFrameworkCore;

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

// 核心服务 - 使用显式注入
builder.Services.AddSingleton<OutputFileService>();
builder.Services.AddSingleton<ClaudeCodeService>();
builder.Services.AddSingleton<TaskWebSocketManager>();
builder.Services.AddSingleton<AgentTeam.Api.Services.PermissionHookService>();
builder.Services.AddSingleton<GitService>();
builder.Services.AddSingleton<WeChatBridgeService>(); // 新增
builder.Services.AddScoped<MessageRouterService>();
builder.Services.AddScoped<MessageIngestionService>();
builder.Services.AddSingleton<ButlerMemoryService>();

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

    // 清理上次非正常关闭导致卡住的任务
    var claudeServiceStartup = scope.ServiceProvider.GetRequiredService<ClaudeCodeService>();
    await claudeServiceStartup.CleanupStuckTasksAsync();
}

// ─── 中间件与路由 ──────────────────────────────────────────────

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseCors();
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
            var incoming = await db.IncomingMessages.FirstOrDefaultAsync(m => m.TriggeredTaskId == taskId);

            if (incoming == null || !string.Equals(incoming.Source, "WeChat", StringComparison.OrdinalIgnoreCase) || string.IsNullOrEmpty(incoming.SourceMessageId))
                return;

            if (status == "Running")
            {
                await wechatBridge.SendMessageAsync(incoming.SourceMessageId, "⏳ Agent 已接收任务，开始深度处理中...");
            }
            else if (status == "Completed")
            {
                var task = await db.Tasks.FindAsync(taskId);
                if (task != null && !string.IsNullOrEmpty(task.OutputFilePath) && File.Exists(task.OutputFilePath))
                {
                    var content = await File.ReadAllTextAsync(task.OutputFilePath);
                    var cleanText = Regex.Replace(content, @"\x1B\[[^@-~]*[@-~]", "");
                    var replyText = cleanText.Length > 2000 ? "..." + cleanText.Substring(cleanText.Length - 1900) : cleanText;
                    await wechatBridge.SendMessageAsync(incoming.SourceMessageId, $"✅ 任务处理完成：\n\n{replyText}");
                }
            }
            else if (status == "Failed")
            {
                await wechatBridge.SendMessageAsync(incoming.SourceMessageId, "❌ 抱歉，Agent 在执行任务时遇到了错误，处理已终止。");
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
Console.WriteLine("Backend is running on http://0.0.0.0:5501 ...");
app.Run("http://0.0.0.0:5501");

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
