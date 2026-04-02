import { useRef, useCallback, useEffect, useState } from 'react';

export type PtyStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// PTY 服务器地址（Node.js，独立端口 3001）
const PTY_WS_BASE = `ws://${window.location.hostname}:5503`;

// ─── 全局状态锁（解决 React Strict Mode 下的重复连接问题） ────────────────────────
let globalActiveWs: WebSocket | null = null;
let globalConnecting = false;

export function usePtyTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  active: boolean,
  cwd?: string,
  initialCommand?: string
) {
  const termRef = useRef<any>(null);
  const mountedRef = useRef(false);
  const [status, setStatus] = useState<PtyStatus>('disconnected');

  // ─── 清理函数 ────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (globalActiveWs) {
      globalActiveWs.onclose = null;
      globalActiveWs.onerror = null;
      globalActiveWs.onmessage = null;
      globalActiveWs.close();
      globalActiveWs = null;
    }
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
    globalConnecting = false;
  }, []);

  // ─── 建立连接 ────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!containerRef.current || !active) return;
    if (globalConnecting || (globalActiveWs && globalActiveWs.readyState === WebSocket.OPEN)) {
      return;
    }

    globalConnecting = true;
    cleanup();
    setStatus('connecting');

    try {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');

      const term = new Terminal({
        theme: {
          background: '#0D1117',
          foreground: '#C9D1D9',
          cursor: '#58A6FF',
          selectionBackground: '#264F78',
          black: '#0D1117', brightBlack: '#484F58',
          red: '#FF7B72', brightRed: '#FFA198',
          green: '#3FB950', brightGreen: '#56D364',
          yellow: '#D29922', brightYellow: '#E3B341',
          blue: '#58A6FF', brightBlue: '#79C0FF',
          magenta: '#BC8CFF', brightMagenta: '#D2A8FF',
          cyan: '#39C5CF', brightCyan: '#56D4DD',
          white: '#B1BAC4', brightWhite: '#F0F6FC',
        },
        fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
        fontSize: 14,
        lineHeight: 1.4,
        cursorBlink: true,
        scrollback: 10000,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);

      // 清空容器再挂载（防止 React Strict Mode 双倍挂载）
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      term.open(containerRef.current!);
      fitAddon.fit();
      termRef.current = term;

      // 连接到 Node.js PTY 服务
      const params = new URLSearchParams();
      if (cwd) params.append('cwd', cwd);
      if (initialCommand) params.append('init', initialCommand);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const wsUrl = `${PTY_WS_BASE}${queryStr}`;
      console.log('[PTY] 连接中:', wsUrl);

      const ws = new WebSocket(wsUrl);
      globalActiveWs = ws;

      ws.onopen = () => {
        setStatus('connected');
        globalConnecting = false;

        // PTY 输出 → xterm
        ws.onmessage = (ev) => {
          if (typeof ev.data === 'string') {
            term.write(ev.data);
          }
        };

        // xterm 输入 → PTY（字符直接透传，node-pty 处理所有特殊键）
        term.onData((data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        // 初始尺寸
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));

        // 终端 resize → 通知 PTY
        term.onResize(({ cols, rows }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
        });

        // 窗口 resize → fit 终端
        const handleWindowResize = () => fitAddon.fit();
        window.addEventListener('resize', handleWindowResize);
      };

      ws.onclose = () => {
        globalConnecting = false;
        globalActiveWs = null;
        if (mountedRef.current) setStatus('disconnected');
      };

      ws.onerror = () => {
        globalConnecting = false;
        globalActiveWs = null;
        if (mountedRef.current) setStatus('error');
      };

    } catch (err) {
      console.error('[PTY] 初始化失败:', err);
      globalConnecting = false;
      setStatus('error');
    }
  }, [containerRef, cleanup, cwd, active]);

  useEffect(() => {
    mountedRef.current = true;
    if (active) connect();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [active, cleanup, connect]);

  const reconnect = useCallback(() => {
    cleanup();
    setTimeout(connect, 100);
  }, [cleanup, connect]);

  return { status, fit: () => {}, reconnect, dispose: cleanup };
}
