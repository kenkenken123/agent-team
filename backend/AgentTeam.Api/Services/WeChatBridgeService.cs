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
            var maskedText = text.Length > 80 ? text.Substring(0, 80) + "..." : text;
            logger.LogInformation("[WeChat] 发送消息给 {UserId}: {Text}", userId, maskedText);
            var resp = await _http.PostAsJsonAsync($"{BaseUrl}/send", new { userId, text });
            if (resp.IsSuccessStatusCode)
            {
                logger.LogInformation("[WeChat] 发送成功 → {UserId}", userId);
                return true;
            }
            else
            {
                var errorBody = await resp.Content.ReadAsStringAsync();
                logger.LogWarning("[WeChat] 发送失败 → HTTP {StatusCode}: {Error}", resp.StatusCode, errorBody);
                return false;
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[WeChat] 发送消息异常 → 目标: {BaseUrl}/send, 用户: {UserId}", BaseUrl, userId);
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
