import React, { useEffect, useRef, useCallback, useState } from 'react';

import { useTerminal } from '../../hooks/useTerminal';
import { useTaskWebSocket } from '../../hooks/useTaskWebSocket';
import type { AgentTask, WsMessage } from '../../types';
import { taskApi } from '../../api/taskApi';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

interface TerminalPanelProps {
  task: AgentTask | null;
  onStatusChange?: (taskId: string, status: string) => void;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ task, onStatusChange }) => {
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('closed');
  const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const { init, write, clear, fit, dispose } = useTerminal(containerRef);
  const loadedTaskIdRef = useRef<string | null>(null);

  // 自定义输出处理器，分离提取思考日志
  const processOutput = useCallback((text: string, instant = false) => {
    const thinkingPattern = /\x1b\[90m\[思考: ([\s\S]*?)\]\x1b\[0m\r\n/g;
    let match;
    let lastIdx = 0;
    while ((match = thinkingPattern.exec(text)) !== null) {
      if (match.index > lastIdx) {
        write(text.substring(lastIdx, match.index), instant);
      }
      const thinkingContent = match[1];
      setThinkingLogs(prev => [...prev, thinkingContent]);
      write('\x1b[34m[✦ 思考过程已折叠，请在上方折叠面板查看 ✦]\x1b[0m\r\n', instant);
      lastIdx = thinkingPattern.lastIndex;
    }
    if (lastIdx < text.length) {
      write(text.substring(lastIdx), instant);
    }
  }, [write]);

  // 初始化终端
  useEffect(() => {
    init();
    const handleResize = () => fit();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      dispose();
    };
  }, []);

  // 任务切换时加载历史输出
  useEffect(() => {
    if (!task || task.id === loadedTaskIdRef.current) return;
    loadedTaskIdRef.current = task.id;
    clear();
    setThinkingLogs([]);

    write(`\x1b[34m┌─ Agent: ${task.agentName}\x1b[0m\r\n`, true);
    write(`\x1b[34m│  Task ID: ${task.id}\x1b[0m\r\n`, true);
    write(`\x1b[34m│  Prompt: ${task.prompt}\x1b[0m\r\n`, true);
    write(`\x1b[34m└─ Status: ${task.status}\x1b[0m\r\n\r\n`, true);

    // 始终尝试加载历史/存量输出
    taskApi.getOutput(task.id).then(content => {
      if (content) processOutput(content, true);
      else if (task.status !== 'Running') {
        write('\x1b[90m[暂无历史输出]\x1b[0m\r\n', true);
      }
    }).catch(err => {
      console.error('加载输出失败', err);
    });
  }, [task?.id]);


  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'output') {
      processOutput(msg.content);
    } else if (msg.type === 'status') {
      const colors: Record<string, string> = {
        Running: '\x1b[33m',
        Completed: '\x1b[32m',
        Failed: '\x1b[31m',
        Cancelled: '\x1b[90m',
      };
      const color = colors[msg.status] ?? '\x1b[0m';
      write(`\r\n${color}[状态变更: ${msg.status}]\x1b[0m\r\n`);
      onStatusChange?.(msg.taskId, msg.status);
    }
  }, [write, onStatusChange]);

  useTaskWebSocket(task?.status === 'Running' ? task.id : null, {
    onMessage: handleWsMessage,
    onOpen: () => {
      setWsStatus('open');
      write('\x1b[90m[已连接实时输出流]\x1b[0m\r\n');
    },
    onClose: () => {
      setWsStatus('closed');
      if (task?.status === 'Running') {
        write('\x1b[90m[连接断开，尝试重连...]\x1b[0m\r\n');
      }
    },
  });


  return (
    <div className="terminal-wrapper">
      {task && (
        <div className="terminal-header-bar">
          <div className="terminal-task-info">
            <span className="dot" style={{ backgroundColor: wsStatus === 'open' ? '#3FB950' : '#F85149' }}></span>
            <span className="info-text">
              {wsStatus === 'open' ? '已连接实时流' : '未连接'} | 任务: {task.id.substring(0, 8)}
            </span>
          </div>
          <div className="terminal-actions">
            <button onClick={() => clear()} className="term-btn">清空</button>
            <button onClick={() => fit()} className="term-btn">自适应</button>
          </div>
        </div>
      )}
      {!task && (
        <div className="terminal-empty">
          <div className="terminal-empty-icon">{'>'}_</div>
          <p>选择一个运行中或历史任务查看输出</p>
        </div>
      )}
      
      {/* 渲染折叠的思考过程面板 */}
      {thinkingLogs.length > 0 && task && (
        <div style={{ backgroundColor: '#1E1E1E', borderBottom: '1px solid #30363D', padding: '8px 12px' }}>
          {thinkingLogs.map((log, idx) => (
            <details key={idx} style={{ marginBottom: idx === thinkingLogs.length - 1 ? 0 : 8 }}>
              <summary style={{ cursor: 'pointer', color: '#8B949E', fontSize: '12px', userSelect: 'none' }}>
                ✦ Claude 思考过程 ({idx + 1}) - 展开查看详情
              </summary>
              <pre style={{ 
                margin: '8px 0 0', 
                padding: '8px', 
                background: '#0D1117', 
                borderRadius: '4px', 
                color: '#8B949E', 
                fontSize: '11px', 
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                {log}
              </pre>
            </details>
          ))}
        </div>
      )}

      <div ref={containerRef} className="terminal-container" style={{ display: task ? 'block' : 'none' }} />
    </div>
  );
};

export default TerminalPanel;
