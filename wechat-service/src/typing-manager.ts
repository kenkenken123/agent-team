// wechat-service/src/typing-manager.ts
// 管理"对方正在输入中"状态的心跳维持
// typing_ticket 约 24h 有效，为长任务每 5 秒续期

import type { WeChatBot } from '@wechatbot/wechatbot';

interface TypingSession {
  heartbeatTimer: ReturnType<typeof setInterval>;
}

export class TypingManager {
  private activeSessions = new Map<string, TypingSession>();

  constructor(private bot: WeChatBot) {}

  /**
   * 开始为指定用户发送"正在输入"心跳
   * Bot SDK 的 sendTyping 内部已处理 typing_ticket 缓存
   */
  start(userId: string): void {
    if (this.activeSessions.has(userId)) return;

    // 立即发送第一次
    this.bot.sendTyping(userId).catch(() => {});

    // 每 5 秒续期一次（API 要求 keepalive 防止超时消失）
    const heartbeatTimer = setInterval(() => {
      this.bot.sendTyping(userId).catch(() => {});
    }, 5000);

    this.activeSessions.set(userId, { heartbeatTimer });
  }

  /**
   * 停止指定用户的"正在输入"状态
   */
  stop(userId: string): void {
    const session = this.activeSessions.get(userId);
    if (!session) return;

    clearInterval(session.heartbeatTimer);
    this.activeSessions.delete(userId);
  }

  /**
   * 清理所有活跃的 Typing 会话（服务关闭时调用）
   */
  stopAll(): void {
    for (const [userId] of this.activeSessions) {
      this.stop(userId);
    }
  }
}
