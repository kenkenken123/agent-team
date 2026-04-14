using System.Net.Http.Json;
using System.Text.Json;

namespace AgentTeam.Api.Services;

/// <summary>
/// 桥接 Node.js WeChat 服务 (默认端口 5600)
/// </summary>
public class WeChatBridgeService(IHttpClientFactory httpClientFactory, ILogger<WeChatBridgeService> logger)
{
    private const string BaseUrl = "http://127.0.0.1:5504";
    private readonly HttpClient _http = httpClientFactory.CreateClient();

    public async Task<JsonElement?> GetStatusAsync()
    {
        try
        {
            return await _http.GetFromJsonAsync<JsonElement>($"{BaseUrl}/status");
        }
        catch (Exception ex)
        {
            logger.LogWarning("无法连接到微信服务: {Message}", ex.Message);
            return null;
        }
    }

    public async Task<bool> SendMessageAsync(string userId, string text)
    {
        try
        {
            var resp = await _http.PostAsJsonAsync($"{BaseUrl}/send", new { userId, text });
            return resp.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "发送微信消息失败");
            return false;
        }
    }

    public async Task<bool> ReconnectAsync()
    {
        try
        {
            var resp = await _http.PostAsync($"{BaseUrl}/reconnect", null);
            return resp.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "请求微信重连失败");
            return false;
        }
    }
}
