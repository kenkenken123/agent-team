// wechat-service/src/router.ts
// 消息路由模块：将微信消息转发给 agent-team 后端 MessageIngestionService
// 后端根据已配置的 Agent 路由规则自动决策触发哪个 Agent

import { config } from './config.js';
import type { MediaResult } from './media-handler.js';

export interface WeChatIncomingMessage {
  /** 微信用户 ID（openId 形式） */
  userId: string;
  /** 消息文本内容 */
  text: string;
  /** 来源（固定为 wechat） */
  source: 'wechat';
  /** 媒体附件（可选） */
  media?: MediaResult;
  /** 用户显示昵称（若可获取） */
  nickname?: string;
}

export interface RoutingResult {
  /** 是否成功触发 Agent */
  success: boolean;
  /** 后端返回的消息 ID */
  messageId?: string;
  /** 错误信息 */
  error?: string;
  /** Agent 回复内容（若后端支持同步回复时使用） */
  reply?: string;
}

/**
 * 将消息发送给 agent-team 后端 /api/message-ingest 接口
 * 复用现有 MessageIngestionService 的路由与 Agent 执行逻辑
 */
export async function routeToBackend(msg: WeChatIncomingMessage): Promise<RoutingResult> {
  const url = `${config.backendUrl}/api/messages/ingest`;

  // 构建发往后端的 payload
  // 与 MessageSources/ParsedMessage 匹配
  const payload = {
    sourceName: 'WeChat',
    senderId: msg.userId,   // 关键：将微信 UserId 作为 SenderId 传给后端
    text: buildPromptText(msg),
    agentId: resolveAgentId(msg.userId),
    optimizePrompt: false, // 微信消息不自动优化 prompt（避免延迟）
    imageUrls: [] as string[],
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { success: false, error: `Backend ${resp.status}: ${text}` };
    }

    const data = await resp.json() as { id?: string };
    return { success: true, messageId: data.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * 根据用户 ID 查找预配置的 Agent 路由
 * 如不存在则返回 undefined（后端自动路由）
 */
function resolveAgentId(userId: string): string | undefined {
  // 精确 userId 匹配
  if (config.agentRoutes[userId]) {
    return config.agentRoutes[userId];
  }
  // 全局默认 Agent
  if (config.defaultAgentId) {
    return config.defaultAgentId;
  }
  return undefined;
}

/**
 * 构建发往后端的 prompt 文本
 * 若附带媒体，添加媒体描述前缀（后续可扩展为上传图片 URL）
 */
function buildPromptText(msg: WeChatIncomingMessage): string {
  if (!msg.media) return msg.text;

  const mediaDesc: Record<string, string> = {
    image: '[图片消息]',
    video: '[视频消息]',
    file: `[文件: ${msg.media.fileName ?? '未知文件'}]`,
    voice: '[语音消息]',
  };

  const prefix = mediaDesc[msg.media.type] ?? '[媒体消息]';
  return msg.text ? `${prefix}\n${msg.text}` : prefix;
}
