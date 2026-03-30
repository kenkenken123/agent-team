using System.Text.Json;
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
    });

builder.Services.AddOpenApi();

// SQLite
builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseSqlite($"Data Source={Path.Combine(builder.Environment.ContentRootPath, "data", "agent-team.db")}"));

// 核心服务
builder.Services.AddSingleton<OutputFileService>();
builder.Services.AddSingleton<ClaudeCodeService>();
builder.Services.AddSingleton<TaskWebSocketManager>();


// CORS（开发时允许前端 5173 端口）
builder.Services.AddCors(opts =>
    opts.AddDefaultPolicy(p =>
        p.WithOrigins("http://localhost:5173", "http://localhost:3000")
         .AllowAnyHeader()
         .AllowAnyMethod()));

var app = builder.Build();

// ─── 数据库初始化 ──────────────────────────────────────────────

using (var scope = app.Services.CreateScope())
{
    var dbCtx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    // 确保 data 目录存在
    Directory.CreateDirectory(Path.Combine(app.Environment.ContentRootPath, "data", "outputs"));
    Directory.CreateDirectory(Path.Combine(app.Environment.ContentRootPath, "data", "sessions"));
    dbCtx.Database.EnsureCreated();
}

// ─── 中间件 ────────────────────────────────────────────────────

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseCors();

// WebSocket 支持
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

// ─── WebSocket 路由：ws://host/ws/task/{taskId} ──────────────────

var wsManager = app.Services.GetRequiredService<TaskWebSocketManager>();
var claudeService = app.Services.GetRequiredService<ClaudeCodeService>();

// 绑定 ClaudeCodeService 事件 → WebSocket 广播
claudeService.OnOutput += async (taskId, content) =>
{
    var msg = JsonSerializer.Serialize(new { type = "output", taskId, content });
    await wsManager.BroadcastAsync(taskId, msg);
};

claudeService.OnStatusChanged += async (taskId, status) =>
{
    var msg = JsonSerializer.Serialize(new { type = "status", taskId, status });
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
Console.WriteLine("Backend is running...");
app.Run();
