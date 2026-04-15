#!/usr/bin/env node
/**
 * Claude Code Permission Stdio Tool
 * 
 * 这是一个桥接脚本，供 Claude Code 的 --permission-prompt-tool 调用。
 * 它从 stdin 读取 JSON 请求，并转发给后端 API 进行逻辑判断或用户交互，
 * 最后将结果写回 stdout。
 */

const http = require('http');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
});

// 从环境变量获取配置，方便调试或多环境运行
const BACKEND_URL = process.env.AGENT_TEAM_BACKEND_URL || 'http://localhost:5501';
const TASK_ID = process.env.AGENT_TEAM_TASK_ID || '';

rl.on('line', async (line) => {
  if (!line.trim()) return;

  try {
    const payload = JSON.parse(line);

    // 仅处理权限请求
    if (payload.type === 'permission_request' || payload.tool_name) {
      const decision = await forwardToBackend(payload);
      process.stdout.write(JSON.stringify(decision) + '\n');
    } else {
      // 其他类型请求默认允许或忽略
      process.stdout.write(JSON.stringify({ approve: true }) + '\n');
    }
  } catch (err) {
    // 解析失败或发生错误，默认拒绝以保证安全
    process.stdout.write(JSON.stringify({ approve: false, reason: 'Internal Tool Error: ' + err.message }) + '\n');
  }
});

/**
 * 将授权请求转发给主后端服务
 */
async function forwardToBackend(payload) {
  const url = new URL(`${BACKEND_URL}/api/permission-tool`);
  
  const body = JSON.stringify(payload);

  return new Promise((resolve) => {
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Task-Id': TASK_ID
      },
      timeout: 120000 // 2分钟超时，给用户留出足够的点击时间
    };

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(responseBody));
          } else {
            resolve({ approve: false, reason: `Backend Error: HTTP ${res.statusCode}` });
          }
        } catch (e) {
          resolve({ approve: false, reason: 'Failed to parse backend response' });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ approve: false, reason: 'Connection failed' });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ approve: false, reason: 'Request timeout' });
    });

    req.write(body);
    req.end();
  });
}
