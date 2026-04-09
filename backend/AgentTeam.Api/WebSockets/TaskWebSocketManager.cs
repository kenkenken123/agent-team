using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;

namespace AgentTeam.Api.WebSockets;

/// <summary>
/// WebSocket 连接管理器：管理 taskId → WebSocket 连接集合
/// </summary>
public class TaskWebSocketManager(IServiceProvider serviceProvider)
{
    // taskId -> (WebSocket -> dummy byte)
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<WebSocket, byte>> _connections = new();

    public void Add(Guid taskId, WebSocket socket)
    {
        _connections.GetOrAdd(taskId, _ => new ConcurrentDictionary<WebSocket, byte>()).TryAdd(socket, 0);
    }

    public async Task BroadcastAsync(Guid taskId, string message)
    {
        if (!_connections.TryGetValue(taskId, out var sockets)) return;

        var bytes = Encoding.UTF8.GetBytes(message);
        var buffer = new ArraySegment<byte>(bytes);

        foreach (var (socket, _) in sockets)
        {
            if (socket.State == WebSocketState.Open)
            {
                try
                {
                    await socket.SendAsync(buffer, WebSocketMessageType.Text, true, CancellationToken.None);
                }
                catch
                {
                    sockets.TryRemove(socket, out _);
                }
            }
            else
            {
                sockets.TryRemove(socket, out _);
            }
        }
    }

    public async Task HandleAsync(Guid taskId, WebSocket socket)
    {
        Add(taskId, socket);

        var buffer = new byte[1024 * 4];
        try
        {
            while (socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close)
                    break;
                
                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var messageText = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    try
                    {
                        var doc = System.Text.Json.JsonDocument.Parse(messageText);
                        var root = doc.RootElement;
                        if (root.TryGetProperty("type", out var typeEl) && typeEl.GetString() == "user_answer")
                        {
                            var answer = root.TryGetProperty("answer", out var ansEl) ? ansEl.GetString() : "";
                            if (answer != null)
                            {
                                using var scope = serviceProvider.CreateScope();
                                var claudeService = scope.ServiceProvider.GetRequiredService<Services.ClaudeCodeService>();
                                await claudeService.SendInputAsync(taskId, answer);
                            }
                        }
                    }
                    catch { /* 忽略格式错误的 JSON */ }
                }
            }
        }
        catch { /* 客户端断开 */ }
        finally
        {
            if (socket.State == WebSocketState.Open)
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "关闭", CancellationToken.None);
        }
    }
}
