import { useCallback, useEffect, useRef } from 'react';


import { WS_BASE } from '../api/request';
import type { WsMessage } from '../types';

interface UseWebSocketOptions {
  onMessage: (msg: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export function useTaskWebSocket(taskId: string | null, options: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);


  const connect = useCallback(() => {
    if (!taskId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE}/ws/task/${taskId}`);
    wsRef.current = ws;

    ws.onopen = () => options.onOpen?.();

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        options.onMessage(msg);
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      options.onClose?.();
      // 3秒后自动重连（任务可能还在运行）
      reconnectTimerRef.current = setTimeout(() => connect(), 3000);
    };

    ws.onerror = () => ws.close();
  }, [taskId]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimerRef.current);
    wsRef.current?.close();
  }, []);

  return { disconnect };
}
