// wechat-service/src/shared.ts
// 使用全局变量确保在任何模块、任何引入方式下都是同一个单例

export interface UserSession {
  userId: string;
  nickname?: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface ServiceState {
  loginStatus: 'disconnected' | 'waiting_qr' | 'scanned' | 'connected';
  accountId?: string;
  qrUrl?: string;
  connectedAt?: string;
  sessionCount: number;
  lastUpdate?: string;
}

// 定义全局类型扩展
declare global {
  var __wechat_state: ServiceState;
  var __wechat_sessions: Map<string, UserSession>;
}

// 初始化（若不存在）
if (!global.__wechat_state) {
  global.__wechat_state = {
    loginStatus: 'disconnected',
    sessionCount: 0,
    lastUpdate: new Date().toISOString()
  };
}

if (!global.__wechat_sessions) {
  global.__wechat_sessions = new Map<string, UserSession>();
}

export const state = global.__wechat_state;
export const userSessions = global.__wechat_sessions;
