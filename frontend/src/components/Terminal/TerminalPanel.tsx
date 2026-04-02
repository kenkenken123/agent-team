import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Modal, Button, Typography, Space, Tooltip } from 'antd';
import { 
  ExpandAltOutlined, 
  ShrinkOutlined, 
  ConsoleSqlOutlined,
  CheckCircleFilled,
  InfoCircleFilled,
  BulbOutlined,
  CodeOutlined,
  CodeSandboxOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { useTerminal } from '../../hooks/useTerminal';
import { useTaskWebSocket } from '../../hooks/useTaskWebSocket';
import type { AgentTask, WsMessage } from '../../types';
import { taskApi } from '../../api/taskApi';
import RealTerminal from './RealTerminal';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

const { Text } = Typography;

interface TerminalPanelProps {
  task: AgentTask | null;
  onStatusChange?: (taskId: string, status: string) => void;
}

type PanelTab = 'output' | 'terminal';

const TerminalPanel: React.FC<TerminalPanelProps> = ({ task, onStatusChange }) => {
  const [activeTab, setActiveTab] = useState<PanelTab>('output');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('closed');
  const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
  const thinkingCountRef = useRef<number>(0);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(true);

  // 提取预览内容的辅助函数 (简单展示一些核心输出内容)
  const [previewContent, setPreviewContent] = useState<string>('');

  const { init, write, clear, fit, dispose } = useTerminal(containerRef, (uri) => {
    const parts = uri.split('/');
    const idxStr = parts[parts.length - 1];
    setModalIndex(parseInt(idxStr, 10));
  });
  const loadedTaskIdRef = useRef<string | null>(null);

  // 自定义输出处理器，分离提取思考日志
  const processOutput = useCallback((text: string, instant = false) => {
    const thinkingPattern = /\x1b\[90m\[思考: ([\s\S]*?)\]\x1b\[0m\r\n/g;
    let match;
    let lastIdx = 0;
    
    // 累积原始输出以供预览
    setPreviewContent(prev => {
      const combined = prev + text;
      // 限制预览长度，避免性能问题
      return combined.length > 5000 ? combined.substring(combined.length - 5000) : combined;
    });

    while ((match = thinkingPattern.exec(text)) !== null) {
      if (match.index > lastIdx) {
        write(text.substring(lastIdx, match.index), instant);
      }
      const thinkingContent = match[1];
      const currentIndex = thinkingCountRef.current;
      thinkingCountRef.current += 1;
      setThinkingLogs(prev => [...prev, thinkingContent]);
      write(`\x1b[34m[✦ 思考过程已折叠，请在此处点击展示: http://show-thinking/${currentIndex} ✦]\x1b[0m\r\n`, instant);
      lastIdx = thinkingPattern.lastIndex;
    }
    if (lastIdx < text.length) {
      write(text.substring(lastIdx), instant);
    }
  }, [write]);

  // 渲染预览内容的逻辑
  const renderedPreview = useMemo(() => {
    if (!previewContent) return task?.status === 'Running' ? '正在等待输出...' : '暂无输出内容';
    
    // 1. 移除 ANSI 转义码
    let clean = previewContent.replace(/\x1b\[[0-9;]*m/g, '');
    
    // 2. 移除 [思考: ...] 块，因为它们已经在 Modal 中展示了
    clean = clean.replace(/\[思考: [\s\S]*?\]\r?\n?/g, '');
    
    // 3. 移除特定的 Agent 装饰线
    clean = clean.replace(/[┌│└]─ Agent:.*?\r?\n?/g, '');
    clean = clean.replace(/[┌│└]─ Task ID:.*?\r?\n?/g, '');
    clean = clean.replace(/[┌│└]─ Prompt:.*?\r?\n?/g, '');
    clean = clean.replace(/[┌│└]─ Status:.*?\r?\n?/g, '');

    return clean.trim();
  }, [previewContent, task?.status]);

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

  // 记录已经加载过输出的 task 状态，避免重复加载
  const loadedStatusRef = useRef<string | null>(null);

  // 任务切换时，重置终端
  useEffect(() => {
    if (!task) return;
    
    // 切换到新任务时，重置全部状态
    if (task.id !== loadedTaskIdRef.current) {
      loadedTaskIdRef.current = task.id;
      loadedStatusRef.current = null;
      clear();
      setThinkingLogs([]);
      setPreviewContent('');
      thinkingCountRef.current = 0;

      write(`\x1b[34m┌─ Agent: ${task.agentName}\x1b[0m\r\n`, true);
      write(`\x1b[34m│  Task ID: ${task.id}\x1b[0m\r\n`, true);
      write(`\x1b[34m│  Prompt: ${task.prompt}\x1b[0m\r\n`, true);
      write(`\x1b[34m└─ Status: ${task.status}\x1b[0m\r\n\r\n`, true);
    }

    // 只有在任务完成/失败后，才从 API 拉取历史输出（补全 WebSocket 可能遗漏的内容）
    // 对于 Running 状态，由 WebSocket 实时推送
    const terminalStatus = task.status;
    if (
      (terminalStatus === 'Completed' || terminalStatus === 'Failed' || terminalStatus === 'Cancelled') &&
      loadedStatusRef.current !== terminalStatus
    ) {
      loadedStatusRef.current = terminalStatus;
      // 先清空再重新加载完整的历史输出
      clear();
      setThinkingLogs([]);
      setPreviewContent('');
      thinkingCountRef.current = 0;
      write(`\x1b[34m┌─ Agent: ${task.agentName}\x1b[0m\r\n`, true);
      write(`\x1b[34m│  Task ID: ${task.id}\x1b[0m\r\n`, true);
      write(`\x1b[34m│  Prompt: ${task.prompt}\x1b[0m\r\n`, true);
      write(`\x1b[34m└─ Status: ${task.status}\x1b[0m\r\n\r\n`, true);
      taskApi.getOutput(task.id).then(content => {
        if (content) processOutput(content, true);
        else write('\x1b[90m[暂无历史输出]\x1b[0m\r\n', true);
      }).catch(err => {
        console.error('加载输出失败', err);
      });
    }
  }, [task?.id, task?.status, clear, processOutput, write]);


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
  }, [write, onStatusChange, processOutput]);

  // 关键修复：只要有 taskId，就建立 WebSocket 连接（不依赖 status）
  // 之前的 bug 是只在 Running 时才连，但任务启动初始是 Pending，导致完全接收不到消息
  useTaskWebSocket(task?.id ?? null, {
    onMessage: handleWsMessage,
    onOpen: () => {
      setWsStatus('open');
      write('\x1b[90m[已连接实时输出流]\x1b[0m\r\n');
    },
    onClose: () => {
      setWsStatus('closed');
    },
  });

  const MarkdownComponents = useMemo(() => ({
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          className="rounded-md my-2"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  }), []);

  return (
    <div className={`terminal-wrapper ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {task && (
        <>
          <div className="terminal-header-bar">
            {/* ── Tab 切换 ── */}
            <div className="terminal-tabs">
              <button
                className={`terminal-tab ${activeTab === 'output' ? 'active' : ''}`}
                onClick={() => setActiveTab('output')}
              >
                <ConsoleSqlOutlined /> 任务输出
              </button>
              <button
                className={`terminal-tab ${activeTab === 'terminal' ? 'active' : ''}`}
                onClick={() => setActiveTab('terminal')}
              >
                <CodeSandboxOutlined /> 真实终端
              </button>
            </div>

            {/* ── 右侧状态 & 操作 ── */}
            {activeTab === 'output' && (
              <>
                <div className="terminal-task-info">
                  <span className="dot" style={{ backgroundColor: wsStatus === 'open' ? '#3FB950' : '#F85149' }}></span>
                  <span className="info-text">
                    {wsStatus === 'open' ? '实时流已连接' : '离线状态'} | {task.status}
                  </span>
                </div>
                <div className="terminal-actions">
                  <Tooltip title={isExpanded ? '折叠预览' : '展开详情'}>
                    <Button
                      type="text"
                      size="small"
                      icon={isExpanded ? <ShrinkOutlined /> : <ExpandAltOutlined />}
                      onClick={() => {
                        const newExpanded = !isExpanded;
                        setIsExpanded(newExpanded);
                        if (newExpanded && !showMarkdown) setTimeout(() => fit(), 100);
                      }}
                      className="term-icon-btn"
                    />
                  </Tooltip>
                  {isExpanded && (
                    <Tooltip title={showMarkdown ? '切换到终端视图' : '切换到 Markdown 视图'}>
                      <Button
                        type="text"
                        size="small"
                        icon={<CodeOutlined />}
                        onClick={() => {
                          const next = !showMarkdown;
                          setShowMarkdown(next);
                          if (!next) setTimeout(() => fit(), 50);
                        }}
                        className={`term-icon-btn ${showMarkdown ? 'active' : ''}`}
                        style={{ color: showMarkdown ? '#58A6FF' : undefined }}
                      />
                    </Tooltip>
                  )}
                  <button onClick={() => clear()} className="term-btn">清空</button>
                  <button onClick={() => fit()} className="term-btn">自适应</button>
                </div>
              </>
            )}
          </div>

          <div className="terminal-content">
            {/* ── 任务输出 Tab ── */}
            {activeTab === 'output' && (
              <>
                {!isExpanded && (
                  <div className="terminal-preview-overlay" onClick={() => setIsExpanded(true)}>
                    <div className="preview-header">
                      <Space>
                        <ConsoleSqlOutlined />
                        <span>Markdown 预览 (点击展开)</span>
                      </Space>
                      {task.status === 'Completed' && <CheckCircleFilled style={{ color: '#3FB950' }} />}
                      {task.status === 'Running' && <InfoCircleFilled style={{ color: '#58A6FF' }} />}
                    </div>
                    <div className="markdown-body preview-mode">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {renderedPreview}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {isExpanded && showMarkdown && (
                  <div className="markdown-body expanded-mode">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                      {renderedPreview}
                    </ReactMarkdown>
                  </div>
                )}

                <div
                  ref={containerRef}
                  className="terminal-container"
                  style={{
                    visibility: (isExpanded && !showMarkdown) ? 'visible' : 'hidden',
                    height: (isExpanded && !showMarkdown) ? '500px' : '0px',
                    transition: 'all 0.3s ease',
                    pointerEvents: (isExpanded && !showMarkdown) ? 'auto' : 'none',
                    position: (isExpanded && showMarkdown) ? 'absolute' : 'relative',
                    top: 0,
                  }}
                />
              </>
            )}

            {/* ── 真实终端 Tab ── */}
            {activeTab === 'terminal' && (
              <RealTerminal 
                active={activeTab === 'terminal'} 
                cwd={task.workingDirectory}
                initialCommand={task.claudeSessionId ? `claude --resume ${task.claudeSessionId}` : 'claude'}
              />
            )}
          </div>
        </>
      )}

      {!task && (
        <div className="terminal-empty">
          <div className="terminal-empty-icon">{'>'}_</div>
          <p>选择一个运行中或历史任务查看输出</p>
        </div>
      )}
      
      <Modal 
        title={
          <Space>
            <BulbOutlined style={{ color: '#FAAD14' }} />
            <span>Claude 思考过程分析</span>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
              ({(modalIndex ?? 0) + 1} / {thinkingLogs.length})
            </Text>
          </Space>
        } 
        open={modalIndex !== null} 
        onCancel={() => setModalIndex(null)}
        footer={[
          <Button key="close" onClick={() => setModalIndex(null)} type="primary">
            完成
          </Button>
        ]}
        width={900}
        centered
        className="thinking-modal"
      >
        <div className="markdown-body">
          {modalIndex !== null && (
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={MarkdownComponents}
            >
              {thinkingLogs[modalIndex]}
            </ReactMarkdown>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default TerminalPanel;
