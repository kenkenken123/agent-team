using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;

namespace AgentTeam.Api.WebSockets;

/// <summary>
/// WebSocket 连接管理器：管理 taskId → WebSocket 连接集合
/// </summary>
public class TaskWebSocketManager
{
    // taskId -> 连接集合
    private readonly ConcurrentDictionary<Guid, ConcurrentBag<WebSocket>> _connections = new();

    public void Add(Guid taskId, WebSocket socket)
    {
        _connections.GetOrAdd(taskId, _ => []).Add(socket);
    }

    public async Task BroadcastAsync(Guid taskId, string message)
    {
        if (!_connections.TryGetValue(taskId, out var sockets)) return;

        var bytes = Encoding.UTF8.GetBytes(message);
        var buffer = new ArraySegment<byte>(bytes);

        var deadSockets = new List<WebSocket>();
        foreach (var socket in sockets)
        {
            if (socket.State == WebSocketState.Open)
            {
                try
                {
                    await socket.SendAsync(buffer, WebSocketMessageType.Text, true, CancellationToken.None);
                }
                catch
                {
                    deadSockets.Add(socket);
                }
            }
            else
            {
                deadSockets.Add(socket);
            }
        }

        // 清理关闭的连接
        foreach (var dead in deadSockets)
            sockets.TryTake(out _);
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
