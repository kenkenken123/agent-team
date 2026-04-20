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
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;


  const connect = useCallback(() => {
    if (!taskId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // 如果超过最大重连次数，不再自动重连
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.warn(`WebSocket 任务 ${taskId} 超过最大重连次数 ${maxReconnectAttempts}`);
      return;
    }

    const ws = new WebSocket(`${WS_BASE}/ws/task/${taskId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`WebSocket 任务 ${taskId} 已连接`);
      reconnectAttemptsRef.current = 0; // 重置计数
      options.onOpen?.();
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        options.onMessage(msg);
      } catch {
        // ignore
      }
    };

    ws.onclose = (event) => {
      options.onClose?.();
      
      // 如果不是正常关闭，则尝试重连
      if (event.code !== 1000 && event.code !== 1001) {
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000); // 指数退避，最高 30s
        console.log(`WebSocket 任务 ${taskId} 连接断开，${delay/1000}秒后进行第 ${reconnectAttemptsRef.current} 次重连...`);
        reconnectTimerRef.current = setTimeout(() => connect(), delay);
      }
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

  const sendMessage = useCallback((msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { disconnect, sendMessage };
}
