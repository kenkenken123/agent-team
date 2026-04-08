#!/usr/bin/env node
/**
 * Claude Code Permission Hook 转发脚本
 * 
 * 配置到 ~/.claude/settings.json 的 hooks.permission_prompt 中：
 *   "command": "node /path/to/permission-hook-bridge.js"
 * 
 * 工作原理：
 * 1. Claude 调用此脚本，通过 stdin 发送工具名称和参数 JSON
 * 2. 脚本将请求转发给后端 /api/permission-hook，同时附带 X-Task-Id 请求头
 * 3. 后端阻塞等待，直到前端用户点击允许/拒绝
 * 4. 后端返回 {"decision": "allow"} 或 {"decision": "deny"}
 * 5. 脚本将此决定写入 stdout，Claude 据此决定是否执行工具
 */

const http = require('http');

async function main() {
  // 从 stdin 读取 Claude 发送的 payload
  let rawData = '';
  for await (const chunk of process.stdin) {
    rawData += chunk;
  }

  const taskId = process.env.AGENT_TEAM_TASK_ID || '';
  const backendUrl = process.env.AGENT_TEAM_BACKEND_URL || 'http://localhost:5501';

  let payload;
  try {
    payload = JSON.parse(rawData);
  } catch {
    // 无法解析时直接拒绝
    process.stdout.write(JSON.stringify({ decision: 'deny' }));
    process.exit(0);
  }

  // 转发给后端，等待用户决定
  const requestBody = JSON.stringify(payload);
  const result = await new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 5501,
      path: '/api/permission-hook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'X-Task-Id': taskId,
      },
      timeout: 90000, // 90秒超时
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ decision: 'deny' });
        }
      });
    });

    req.on('error', () => resolve({ decision: 'deny' }));
    req.on('timeout', () => { req.destroy(); resolve({ decision: 'deny' }); });

    req.write(requestBody);
    req.end();
  });

  process.stdout.write(JSON.stringify(result));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ decision: 'deny' }));
});
