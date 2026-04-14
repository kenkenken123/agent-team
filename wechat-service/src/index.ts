// wechat-service/src/index.ts
// 服务入口：初始化 WeChatBot，连接 agent-team 后端

import { WeChatBot, loggingMiddleware, rateLimitMiddleware } from '@wechatbot/wechatbot';
import { config } from './config.js';
import { TypingManager } from './typing-manager.js';
import { MediaHandler } from './media-handler.js';
import { routeToBackend } from './router.js';
import { state, userSessions } from './shared.js';
import {
  startStateServer,
  registerSendCallback,
  registerReconnectCallback,
} from './state-server.js';

// ─── 初始化 Bot ──────────────────────────────────────────────────────────────

const bot = new WeChatBot({
  storage: 'file',
  storageDir: config.storageDir,
  logLevel: config.logLevel,
});

// ─── 中间件 ──────────────────────────────────────────────────────────────────

bot.use(loggingMiddleware(bot.logger));
bot.use(rateLimitMiddleware({
  maxMessages: config.rateLimit.maxMessages,
  windowMs: config.rateLimit.windowMs,
}));

// ─── 辅助模块 ────────────────────────────────────────────────────────────────

const typingManager = new TypingManager(bot);
const mediaHandler = new MediaHandler(bot);

// ─── 消息处理 ────────────────────────────────────────────────────────────────

bot.onMessage(async (msg) => {
  const userId = msg.userId ?? 'unknown';
  const text   = msg.text ?? '';

  console.log(`[WeChat] 收到消息 from=${userId}: ${text.slice(0, 80)}`);

  // 更新用户会话记录
  const existingSession = userSessions.get(userId);
  userSessions.set(userId, {
    userId,
    nickname: existingSession?.nickname,
    lastMessageAt: new Date().toISOString(),
    messageCount: (existingSession?.messageCount ?? 0) + 1,
  });
  state.sessionCount = userSessions.size;

  // 开始 Typing 心跳（在 Agent 处理期间持续显示"正在输入"）
  typingManager.start(userId);

  try {
    // 处理媒体消息
    const media = await mediaHandler.handle(msg);

    // 路由给后端 agent-team 的 MessageIngestionService
    const result = await routeToBackend({
      userId,
      text,
      source: 'wechat',
      media: media ?? undefined,
    });

    if (!result.success) {
      console.error('[WeChat] 路由失败:', result.error);
      await bot.reply(msg, '抱歉，消息处理失败，请稍后重试。');
    } else {
      console.log(`[WeChat] 消息已提交给后端，任务 ID: ${result.messageId}`);
    }
  } catch (err) {
    console.error('[WeChat] 消息处理异常:', err);
    await bot.reply(msg, '系统内部错误，请稍后重试。');
  } finally {
    // 停止 Typing 心跳
    typingManager.stop(userId);
  }
});

// ─── 事件监听 ────────────────────────────────────────────────────────────────

bot.on('login', (creds: { accountId?: string }) => {
  state.loginStatus = 'connected';
  state.accountId  = creds.accountId;
  state.connectedAt = new Date().toISOString();
  state.qrUrl = undefined;
  state.lastUpdate = new Date().toISOString();
  console.log(`[WeChat] ✅ 登录成功！账户: ${creds.accountId}`);
});

bot.on('session:expired', () => {
  state.loginStatus = 'disconnected';
  state.accountId = undefined;
  state.lastUpdate = new Date().toISOString();
  console.log('[WeChat] ⚠️  会话已过期，需要重新扫码登录');
});

bot.on('session:restored', (creds: { accountId?: string }) => {
  state.loginStatus = 'connected';
  state.accountId = creds.accountId;
  state.connectedAt = new Date().toISOString();
  state.lastUpdate = new Date().toISOString();
  console.log(`[WeChat] 🔄 会话已恢复，账户: ${creds.accountId}`);
});

bot.on('error', (err: unknown) => {
  console.error('[WeChat] ❌ Bot 错误:', err);
});

bot.on('close', () => {
  console.log('[WeChat] Bot 已关闭');
  typingManager.stopAll();
});

// ─── 状态服务器回调注册 ───────────────────────────────────────────────────────

registerSendCallback(async (userId: string, text: string) => {
  await bot.send(userId, text);
  console.log(`[WeChat] 主动发送消息给 ${userId}: ${text.slice(0, 80)}`);
});

registerReconnectCallback(async () => {
  console.log('[WeChat] 收到重连请求，强制注销并获取新二维码...');
  await bot.login({
    force: true,
    callbacks: {
      onQrUrl: (url: string) => {
        state.loginStatus = 'waiting_qr';
        state.qrUrl = url;
        state.lastUpdate = new Date().toISOString();
        console.log('\n[DEBUG] Reconnect QR Received!');
        console.log(`[DEBUG] URL: ${url}\n`);
      }
    }
  });
});

// ─── 启动逻辑 ────────────────────────────────────────────────────────────────

async function main() {
  // 启动内置 HTTP 状态服务器
  startStateServer();

  console.log(`\n${'='.repeat(50)}`);
  console.log('  WeChat iLink Bot Service - agent-team 微信桥接');
  console.log(`  后端地址: ${config.backendUrl}`);
  console.log(`  状态服务: http://localhost:${config.servicePort}`);
  console.log(`  存储目录: ${config.storageDir}`);
  console.log(`${'='.repeat(50)}\n`);

  // 全局异常处理
  process.on('uncaughtException', (err) => {
    console.error('\n[FATAL] Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('\n[FATAL] Unhandled Rejection:', reason);
  });

  // 保持进程运行
  process.stdin.resume();

  try {
    console.log('[WeChat] 正在初始化登录...');
    // 在 login 调用中定义回调是目前最可靠的捕获二维码方式
    await bot.login({
      callbacks: {
        onQrUrl: (url: string) => {
          state.loginStatus = 'waiting_qr';
          state.qrUrl = url;
          state.lastUpdate = new Date().toISOString();
          console.log('\n[WeChat] >>> QR Code Received <<<');
          console.log(`[WeChat] URL: ${url}\n`);
        },
        onScanned: () => {
          state.loginStatus = 'scanned';
          state.qrUrl = undefined;
          state.lastUpdate = new Date().toISOString();
          console.log('[WeChat] >>> Scanned (Awaiting Confirmation) <<<');
        },
        onExpired: () => {
          state.loginStatus = 'waiting_qr';
          state.qrUrl = undefined;
          state.lastUpdate = new Date().toISOString();
          console.log('[WeChat] >>> QR Code Expired <<<');
        }
      }
    });
    
    console.log('[WeChat] 正在启动消息监听循环...');
    await bot.start();
  } catch (err) {
    console.error('\n[FATAL] Service failed to start:', err);
    process.exit(1);
  }
}

// 执行主函数
main().catch(err => {
  console.error('[FATAL] Main loop error:', err);
});
