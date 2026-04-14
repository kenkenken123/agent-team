import api from './request';

export interface WeChatStatus {
  loginStatus: 'disconnected' | 'waiting_qr' | 'scanned' | 'connected';
  accountId?: string;
  qrUrl?: string;
  connectedAt?: string;
  sessionCount: number;
  activeSessions: WeChatSession[];
}

export interface WeChatSession {
  userId: string;
  nickname?: string;
  lastMessageAt: string;
  messageCount: number;
}

export const wechatApi = {
  getStatus: () => api.get<WeChatStatus>('/api/wechat/status').then(r => r.data),
  reconnect: () => api.post('/api/wechat/reconnect').then(r => r.data),
  send: (userId: string, text: string) => api.post('/api/wechat/send', { userId, text }).then(r => r.data),
};
