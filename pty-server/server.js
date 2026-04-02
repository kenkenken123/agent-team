// PTY Server - 使用 node-pty 提供真实的终端模拟
// 每个 WebSocket 连接 → 一个独立的 PTY 进程
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const os = require('os');

const PORT = process.env.PTY_PORT || 5503;
const SHELL = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');

const wss = new WebSocketServer({ port: PORT });
console.log(`[PTY] 服务器启动，监听端口 ${PORT}，Shell: ${SHELL}`);

wss.on('connection', (ws, req) => {
  // 从 URL 查询参数中获取工作目录
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const cwd = url.searchParams.get('cwd') || os.homedir();

  // 验证目录是否存在
  const fs = require('fs');
  const workingDir = fs.existsSync(cwd) ? cwd : os.homedir();

  console.log(`[PTY] 新连接，工作目录: ${workingDir}`);

  // 解析初始指令
  const initCommand = url.searchParams.get('init');

  // 创建 PTY 进程
  const shellArgs = os.platform() === 'win32' ? ['-NoLogo'] : [];
  const ptyProcess = pty.spawn(SHELL, shellArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: workingDir,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      PSStyle_OutputRendering: 'Ansi',
    },
  });

  console.log(`[PTY] PTY 进程已启动，PID: ${ptyProcess.pid}`);

  // 如果有初始指令，在短延迟后自动执行（确保 Shell 提示符已就绪）
  if (initCommand) {
    console.log(`[PTY] 自动执行初始指令: ${initCommand}`);
    setTimeout(() => {
      if (ws.readyState === ws.OPEN) {
        // 加上回车符保证执行
        ptyProcess.write(`${initCommand}\r`);
      }
    }, 800);
  }

  // PTY 输出 → WebSocket（直接透传）
  ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  });

  // PTY 退出
  ptyProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] PTY 进程退出，exitCode: ${exitCode}`);
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n\x1b[1;33m[会话已结束]\x1b[0m\r\n`);
      ws.close();
    }
  });

  // WebSocket 消息 → PTY 输入
  ws.on('message', (message) => {
    const raw = message.toString();
    try {
      // 尝试解析为 JSON（用于控制指令）
      const parsed = JSON.parse(raw);
      
      // 只有显式包含 type 的 JSON 对象才作为指令处理
      if (typeof parsed === 'object' && parsed !== null && parsed.type === 'resize') {
        ptyProcess.resize(
          Math.max(1, parseInt(parsed.cols) || 80),
          Math.max(1, parseInt(parsed.rows) || 24)
        );
        return; // 处理完指令，退出
      }
    } catch {
      // 解析失败说明是普通的键盘字符，继续向下透传
    }

    // 转发给 PTY（包括解析失败的、或者是解析成功但不是指令的单数字/布尔值等）
    ptyProcess.write(raw);
  });

  // WebSocket 关闭 → 杀死 PTY 进程
  ws.on('close', () => {
    console.log(`[PTY] 连接关闭，清理 PTY 进程 PID: ${ptyProcess.pid}`);
    try {
      ptyProcess.kill();
    } catch (e) {
      // 进程可能已经退出，忽略
    }
  });

  ws.on('error', (err) => {
    console.error('[PTY] WebSocket 错误:', err.message);
  });
});
