// wechat-service/src/media-handler.ts
// 处理来自微信的媒体文件（图片/文件/视频/语音）
// 将媒体转换为 URL 或 Base64 供后端处理

import type { WeChatBot } from '@wechatbot/wechatbot';

export interface MediaResult {
  type: 'image' | 'file' | 'video' | 'voice';
  /** 文件名（文件类型才有） */
  fileName?: string;
  /** 媒体数据 Buffer 转 Base64 */
  base64: string;
  /** MIME 类型猜测 */
  mimeType: string;
}

function getMimeType(type: string, fileName?: string): string {
  if (type === 'image') return 'image/jpeg';
  if (type === 'video') return 'video/mp4';
  if (type === 'voice') return 'audio/wav';
  if (type === 'file' && fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      zip: 'application/zip',
    };
    return mimeMap[ext] ?? 'application/octet-stream';
  }
  return 'application/octet-stream';
}

export class MediaHandler {
  constructor(private bot: WeChatBot) {}

  /**
   * 下载消息中的媒体内容，返回 Base64 编码结果
   * 若消息不含媒体，返回 null
   */
  async handle(msg: Parameters<Parameters<WeChatBot['onMessage']>[0]>[0]): Promise<MediaResult | null> {
    try {
      // @ts-expect-error SDK 类型定义可能需要版本匹配
      const media = await this.bot.download(msg);
      if (!media) return null;

      return {
        type: media.type,
        fileName: media.fileName,
        base64: media.data.toString('base64'),
        mimeType: getMimeType(media.type, media.fileName),
      };
    } catch (err) {
      console.error('[MediaHandler] download failed:', err);
      return null;
    }
  }
}
