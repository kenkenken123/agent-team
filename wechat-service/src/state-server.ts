// wechat-service/src/state-server.ts
// 内置 HTTP 服务器：供 agent-team 后端查询/控制本服务状态
// 端口：5600（可通过 WECHAT_SERVICE_PORT 环境变量修改）
//
// 路由：
//   GET  /status        → 返回登录状态、账户信息
//   GET  /sessions      → 返回当前活跃的用户会话列表
//   POST /send          → 主动向指定用户发消息
//   POST /logout        → 断开当前会话
//   POST /reconnect     → 触发重新登录（生成新 QR 码）

import http from 'node:http';
import { config } from './config.js';

import { state, userSessions } from './shared.js';

// 注册"主动发消息"的回调（由 index.ts 注入）
let sendCallback: ((userId: string, text: string) => Promise<void>) | null = null;
let reconnectCallback: (() => Promise<void>) | null = null;

export function registerSendCallback(fn: (userId: string, text: string) => Promise<void>) {
  sendCallback = fn;
}

export function registerReconnectCallback(fn: () => Promise<void>) {
  reconnectCallback = fn;
}

function jsonResponse(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

export function startStateServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS 支持（允许 .NET 后端和前端直接调用）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? '/';

    // GET /status
    if (req.method === 'GET' && url === '/status') {
      jsonResponse(res, 200, {
        ...state,
        activeSessions: Array.from(userSessions.values()),
      });
      return;
    }

    // GET /sessions
    if (req.method === 'GET' && url === '/sessions') {
      jsonResponse(res, 200, Array.from(userSessions.values()));
      return;
    }

    // POST /send  { userId: string, text: string }
    if (req.method === 'POST' && url === '/send') {
      try {
        const body = JSON.parse(await readBody(req)) as { userId?: string; text?: string };
        if (!body.userId || !body.text) {
          jsonResponse(res, 400, { error: 'userId 和 text 不能为空' });
          return;
        }
        if (!sendCallback) {
          jsonResponse(res, 503, { error: '服务尚未登录' });
          return;
        }
        await sendCallback(body.userId, body.text);
        jsonResponse(res, 200, { success: true });
      } catch (err) {
        jsonResponse(res, 500, { error: String(err) });
      }
      return;
    }

    // POST /reconnect
    if (req.method === 'POST' && url === '/reconnect') {
      if (!reconnectCallback) {
        jsonResponse(res, 503, { error: '重连功能未就绪' });
        return;
      }
      reconnectCallback().catch(console.error);
      jsonResponse(res, 200, { success: true, message: '正在重新登录，请扫描新的 QR 码' });
      return;
    }

    jsonResponse(res, 404, { error: 'Not Found' });
  });

  server.listen(config.servicePort, '0.0.0.0', () => {
    console.log(`[StateServer] 状态服务已启动，端口：${config.servicePort}`);
  });

  return server;
}
