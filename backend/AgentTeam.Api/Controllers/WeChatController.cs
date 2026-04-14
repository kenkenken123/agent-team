using AgentTeam.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgentTeam.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WeChatController(WeChatBridgeService wechatBridge) : ControllerBase
{
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var status = await wechatBridge.GetStatusAsync();
        if (status == null)
            return StatusCode(503, new { error = "微信服务未启动或无法连接" });
            
        return Ok(status);
    }

    [HttpPost("reconnect")]
    public async Task<IActionResult> Reconnect()
    {
        var success = await wechatBridge.ReconnectAsync();
        return success ? Ok(new { message = "已发送重连请求" }) : StatusCode(500, new { error = "重连请求失败" });
    }

    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] SendRequest request)
    {
        if (string.IsNullOrEmpty(request.UserId) || string.IsNullOrEmpty(request.Text))
            return BadRequest(new { error = "UserId 和 Text 不能为空" });

        var success = await wechatBridge.SendMessageAsync(request.UserId, request.Text);
        return success ? Ok(new { message = "消息已发送" }) : StatusCode(500, new { error = "发送失败" });
    }

    public class SendRequest
    {
        public string UserId { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
    }
}
