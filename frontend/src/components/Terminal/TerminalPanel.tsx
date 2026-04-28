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

import { useAppStore } from '../../stores/appStore';
import { useTerminal } from '../../hooks/useTerminal';
import { useTaskWebSocket } from '../../hooks/useTaskWebSocket';
import type { AgentTask, WsMessage, WsPermissionRequestMessage, WsAskUserQuestionMessage } from '../../types';
import { taskApi } from '../../api/taskApi';
import { requestNotificationPermission, showNotification } from '../../utils/notification';
import RealTerminal from './RealTerminal';
import PermissionDialog from './PermissionDialog';
import UserQuestionDialog from './UserQuestionDialog';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

const { Text } = Typography;

const CollapsibleCodeBlock = ({ language, code }: { language: string, code: string }) => {
  const [expanded, setExpanded] = useState(false);
  
  if (!expanded) {
    return (
      <div 
        className="rounded-md my-2 cursor-pointer" 
        style={{ background: '#1C2128', padding: '12px 16px', border: '1px dashed #30363D', color: '#8B949E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        onClick={() => setExpanded(true)}
        title="点击展开代码"
      >
        <Space>
          <CodeOutlined />
          <span>代码片段 ({language || 'text'}) - {code.split('\n').length} 行</span>
        </Space>
        <ExpandAltOutlined />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
        <Button 
            type="text" 
            size="small" 
            icon={<ShrinkOutlined />} 
            onClick={() => setExpanded(false)}
            style={{ position: 'absolute', top: 4, right: 4, zIndex: 10, color: '#C9D1D9', background: 'rgba(0,0,0,0.5)' }}
            title="折叠代码"
        />
        <SyntaxHighlighter
          style={oneDark}
          language={language}
          PreTag="div"
          className="rounded-md my-2"
        >
          {code}
        </SyntaxHighlighter>
    </div>
  );
};

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
  const markdownRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(true);
  const { initialConsoleTab, setInitialConsoleTab } = useAppStore();

  // ─── 授权请求列表 ───────────────────────────────────────────────
  const [pendingPermissions, setPendingPermissions] = useState<WsPermissionRequestMessage[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<WsAskUserQuestionMessage[]>([]);

  useEffect(() => {
    if (initialConsoleTab) {
      setActiveTab(initialConsoleTab);
      // Wait a bit then clear it so it doesn't keep switching
      setInitialConsoleTab(null);
    }
  }, [initialConsoleTab, setInitialConsoleTab]);

  // 提取预览内容的辅助函数 (简单展示一些核心输出内容)
  const [previewContent, setPreviewContent] = useState<string>('');

  const { init, write, clear, fit, dispose } = useTerminal(containerRef, (uri) => {
    const parts = uri.split('/');
    const idxStr = parts[parts.length - 1];
    setModalIndex(parseInt(idxStr, 10));
  });

  const [lineLimit, setLineLimit] = useState(300);
  const [totalLineCount, setTotalLineCount] = useState(0);
  const loadedTaskIdRef = useRef<string | null>(null);

  // 自定义输出处理器，分离提取思考日志
  const processOutput = useCallback((text: string, instant = false) => {
    const thinkingPattern = /\x1b\[90m\[思考: ([\s\S]*?)\]\x1b\[0m\r\n/g;
    let match;
    let lastIdx = 0;
    
    // 累积内容用于 Markdown 预览模式 (增加上限至 50万字符，避免截断长分析)
    setPreviewContent(prev => {
      const combined = prev + text;
      const MAX_PREVIEW = 500000;
      return combined.length > MAX_PREVIEW ? combined.substring(combined.length - MAX_PREVIEW) : combined;
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
    
    // 2. 移除 [思考: ...] 块
    clean = clean.replace(/\[思考: [\s\S]*?\]\r?\n?/g, '');
    
    // 3. 装饰线移除 (仅移除明确的 Meta 信息行)
    clean = clean.replace(/^[┌│└]─ Agent:.*?\r?\n?/gm, '');
    clean = clean.replace(/^[┌│└]─ Task ID:.*?\r?\n?/gm, '');
    clean = clean.replace(/^[┌│└]─ Prompt:.*?\r?\n?/gm, '');
    clean = clean.replace(/^[┌│└]─ Status:.*?\r?\n?/gm, '');

    // 4. 截断极长的工具调用描述并转化为便于展示的格式
    clean = clean.replace(/\[Claude (正在调用工具|is using tool): ([\s\S]*?)\]/g, (match, p1, p2) => {
      let content = p2.trim().replace(/\r?\n/g, ' ');
      if (content.length > 80) {
        content = content.substring(0, 80) + '...';
      }
      const parsedToolName = content.match(/^([a-zA-Z0-9_-]+)/)?.[1] || 'Tool';
      const restContent = content.substring(parsedToolName.length).trim();
      return `\`TOOL:${parsedToolName}|${restContent}\``;
    });

    const lines = clean.trim().split(/\r?\n/);
    setTotalLineCount(lines.length);
    
    // 如果是未展开界面，展示最后 30 行以体现更多“最新信息”
    if (!isExpanded) {
      return lines.slice(-30).join('\n');
    }

    if (lines.length > lineLimit) {
      return lines.slice(-lineLimit).join('\n');
    }

    return lines.join('\n');
  }, [previewContent, task?.status, lineLimit, isExpanded]);

  // 初始化终端
  useEffect(() => {
    init();
    requestNotificationPermission();
    const handleResize = () => fit();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      dispose();
    };
  }, []);

  // 关键优化：点击展开 Markdown 视图时，默认定位到最后一行
  useEffect(() => {
    if (isExpanded && showMarkdown) {
      setTimeout(() => {
        if (markdownRef.current) {
          markdownRef.current.scrollTop = markdownRef.current.scrollHeight;
        }
      }, 150);
    }
  }, [isExpanded, showMarkdown, previewContent]);

  // 记录已经加载过输出的 task 状态，避免重复加载
  const loadedStatusRef = useRef<string | null>(null);
  const taskId = task?.id;
  const taskStatus = task?.status;

  // 清理 ANSI 转义码的工具函数
  const cleanAnsi = useCallback((text: string) => {
    return text
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\x1b\[90m\[思考: [\s\S]*?\]\x1b\[0m\r?\n?/g, '')
      .replace(/\[Claude 正在调用工具: [\s\S]*?\]\r?\n?/g, '[TOOL]')
      .replace(/\[Claude 提问: [\s\S]*?\]\r?\n?/g, '')
      .replace(/\[回答完成\]/g, '')
      .replace(/\[系统错误\][\s\S]*?\r?\n?/g, '')
      .replace(/┌─.*?\r?\n?/g, '')
      .replace(/│.*?\r?\n?/g, '')
      .replace(/└─.*?\r?\n?/g, '');
  }, []);

  // ─── 查看详情：加载完整过程日志并切换到终端模式 ──────────────
  const handleViewDetail = useCallback(async () => {
    if (!task) return;
    setIsExpanded(true);
    setShowMarkdown(false);

    try {
      const content = await taskApi.getOutput(task.id);
      if (content) {
        clear();
        setThinkingLogs([]);
        thinkingCountRef.current = 0;
        write(`\x1b[34m┌─ Agent: ${task.agentName}\x1b[0m\r\n`, true);
        write(`\x1b[34m│  Task ID: ${task.id}\x1b[0m\r\n`, true);
        write(`\x1b[34m│  Prompt: ${task.prompt}\x1b[0m\r\n`, true);
        write(`\x1b[34m└─ Status: ${task.status}\x1b[0m\r\n\r\n`, true);
        processOutput(content, true);
        setTimeout(() => fit(), 150);
      } else {
        write('\x1b[90m[暂无过程记录]\x1b[0m\r\n', true);
      }
    } catch (err) {
      console.error('加载详细过程失败', err);
      write('\x1b[31m[加载详细过程失败]\x1b[0m\r\n', true);
    }
  }, [task, clear, write, processOutput, fit]);

  useEffect(() => {
    // 初始化或状态变更时的处理
    if (!task) return;
    const terminalStatus = task.status;
    const isFinished = (terminalStatus === 'Completed' || terminalStatus === 'Failed' || terminalStatus === 'Cancelled');

    // 优化：已完成任务且有最终结果时，直接展示结果，不加载完整日志
    if (isFinished && terminalStatus === 'Completed' && task.finalResult) {
      if (loadedTaskIdRef.current === task.id && loadedStatusRef.current === terminalStatus) return;

      loadedTaskIdRef.current = task.id;
      loadedStatusRef.current = terminalStatus;

      // 清理 ANSI 码后直接展示最终结果
      const cleanedResult = cleanAnsi(task.finalResult).trim();
      setPreviewContent(cleanedResult);
      setShowMarkdown(true);
      setThinkingLogs([]);
      thinkingCountRef.current = 0;
      return;
    }

    // 如果是切换了任务，或者任务从未加载过，或者任务刚完成，我们需要拉取历史/补全历史
    if (
      task.id !== loadedTaskIdRef.current ||
      (isFinished && loadedStatusRef.current !== terminalStatus) ||
      (!loadedStatusRef.current && terminalStatus === 'Running')
    ) {
      const isNewTask = task.id !== loadedTaskIdRef.current;
      loadedTaskIdRef.current = task.id;
      loadedStatusRef.current = terminalStatus;

      if (isNewTask) {
        clear();
        setThinkingLogs([]);
        setPreviewContent('');
        thinkingCountRef.current = 0;
        write(`\x1b[34m┌─ Agent: ${task.agentName}\x1b[0m\r\n`, true);
        write(`\x1b[34m│  Task ID: ${task.id}\x1b[0m\r\n`, true);
        write(`\x1b[34m│  Prompt: ${task.prompt}\x1b[0m\r\n`, true);
        write(`\x1b[34m└─ Status: ${task.status}\x1b[0m\r\n\r\n`, true);
      }

      // 拉取当前已有的所有输出
      taskApi.getOutput(task.id).then(content => {
        if (content) {
          // 如果是重新拉取完成态的任务，或者初始化 Running 任务，直接覆盖/补全
          if (isFinished || isNewTask) {
            clear();
            setThinkingLogs([]);
            setPreviewContent('');
            thinkingCountRef.current = 0;
            write(`\x1b[34m┌─ Agent: ${task.agentName}\x1b[0m\r\n`, true);
            write(`\x1b[34m│  Task ID: ${task.id}\x1b[0m\r\n`, true);
            write(`\x1b[34m│  Prompt: ${task.prompt}\x1b[0m\r\n`, true);
            write(`\x1b[34m└─ Status: ${task.status}\x1b[0m\r\n\r\n`, true);
            processOutput(content, true);
          }
        } else if (isNewTask) {
           write('\x1b[90m[等待实时输出流...]\x1b[0m\r\n', true);
        }
      }).catch(err => {
        console.error('加载历史输出失败', err);
      });
    }
  }, [taskId, taskStatus, clear, processOutput, write, task?.finalResult, cleanAnsi]);

  // 处理“加载更多”逻辑
  useEffect(() => {
    if (showMarkdown) return; // 终端模式下的 Re-write 逻辑
    // 暂时保持 xterm 完整记录，仅对 Markdown 预览做限制，因为 xterm 自带滚动
  }, [lineLimit]);


  const handleWsMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'output':
        processOutput(msg.content);
        break;
      case 'status': {
        const colors: Record<string, string> = {
          Running: '\x1b[33m',
          Completed: '\x1b[32m',
          Failed: '\x1b[31m',
          Cancelled: '\x1b[90m',
        };
        const color = colors[msg.status] ?? '\x1b[0m';
        write(`\r\n${color}[状态变更: ${msg.status}]\x1b[0m\r\n`);
        onStatusChange?.(msg.taskId, msg.status);

        if (msg.status === 'Completed' || msg.status === 'Failed') {
          showNotification(`任务${msg.status === 'Completed' ? '已完成' : '执行失败'}`, {
            body: `任务 ID: ${msg.taskId.substring(0, 8)}\n状态: ${msg.status}`,
            tag: msg.taskId, // 避免重复通知
          });
        }
        break;
      }
      case 'permission_request': {
        // 将授权请求加入队列，在 UI 中展示对话框
        setPendingPermissions(prev => {
          // 避免重复加入
          if (prev.some(p => p.requestId === msg.requestId)) return prev;
          return [...prev, msg];
        });
        // 同时在终端写入提示文字
        write(`\r\n\x1b[33m[⏸ Claude 请求授权: ${msg.toolName} - 请在上方对话框中确认]\x1b[0m\r\n`);
        break;
      }
      case 'permission_resolved': {
        // 授权请求已完成（不论来自用户点击还是超时），从队列移除
        setPendingPermissions(prev => prev.filter(p => p.requestId !== msg.requestId));
        const icon = msg.decision === 'allow' ? '\x1b[32m✓' : '\x1b[31m✗';
        write(`${icon} [授权结果: ${msg.decision === 'allow' ? '已允许' : '已拒绝'}]\x1b[0m\r\n`);
        break;
      }
      case 'ask_user_question': {
        setPendingQuestions(prev => {
          if (prev.some(p => p.requestId === msg.requestId)) return prev;
          return [...prev, msg];
        });
        write(`\r\n\x1b[33m[💬 Claude 正在提问，请在上方对话框中回答]\x1b[0m\r\n`);
        break;
      }
    }
  }, [write, onStatusChange, processOutput]);

  const { sendMessage } = useTaskWebSocket(task?.id ?? null, {
    onMessage: (msg) => handleWsMessage(msg),
    onOpen: () => {
      setWsStatus('open');
      write('\x1b[90m[已连接实时输出流]\x1b[0m\r\n');
    },
    onClose: () => {
      setWsStatus('closed');
    },
  });

  // 关键修复：只要有 taskId，就建立 WebSocket 连接（不依赖 status）
  // 之前的 bug 是只在 Running 时才连，但任务启动初始是 Pending，导致完全接收不到消息
  // useTaskWebSocket 已经在上方调用并解构出 sendMessage
  
  // 切换任务时清除遗留的授权请求队列和提问队列
  useEffect(() => {
    setPendingPermissions([]);
    setPendingQuestions([]);
  }, [task?.id]);

  const MarkdownComponents = useMemo(() => ({
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const text = String(children);
      
      if (inline && text.startsWith('TOOL:')) {
        const parts = text.replace('TOOL:', '').split('|');
        const toolName = parts[0];
        const content = parts[1];
        let bgColor = '#58a6ff'; // Default blue
        if (toolName.toLowerCase().includes('read') || toolName.toLowerCase().includes('file')) bgColor = '#1f6feb';
        else if (toolName.toLowerCase().includes('edit') || toolName.toLowerCase().includes('replace')) bgColor = '#8957e5';
        else if (toolName.toLowerCase().includes('bash') || toolName.toLowerCase().includes('command')) bgColor = '#d29922';
        
        return (
          <span style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            background: 'transparent', margin: '4px 0', verticalAlign: 'middle'
          }}>
             <span style={{ background: bgColor, color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
               {toolName}
             </span>
             {content && content !== '()' && (
                 <span style={{ color: '#8b949e', fontSize: '11px', background: '#1c2128', padding: '2px 6px', borderRadius: '4px', border: '1px solid #30363d' }}>
                   {content}
                 </span>
             )}
          </span>
        );
      }

      return !inline && match ? (
        <CollapsibleCodeBlock language={match[1]} code={text.replace(/\n$/, '')} />
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
                  <Tooltip title={isExpanded ? '折叠预览' : (task.status === 'Completed' && task.finalResult ? '查看详情' : '展开详情')}>
                    <Button
                      type="text"
                      size="small"
                      icon={isExpanded ? <ShrinkOutlined /> : <ExpandAltOutlined />}
                      onClick={() => {
                        if (isExpanded) {
                          // 折叠：已完成任务回到最终结果视图
                          setIsExpanded(false);
                          setShowMarkdown(true);
                        } else if (task.status === 'Completed' && task.finalResult) {
                          // 已完成任务：加载完整过程
                          handleViewDetail();
                        } else {
                          // 运行中任务：正常展开
                          const newExpanded = !isExpanded;
                          setIsExpanded(newExpanded);
                          if (newExpanded && !showMarkdown) setTimeout(() => fit(), 100);
                        }
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
            {/* ── 授权请求对话框区域 ── */}
            {pendingPermissions.length > 0 && activeTab === 'output' && (
              <div style={{ padding: '8px 12px 0' }}>
                {pendingPermissions.map(req => (
                  <PermissionDialog
                    key={req.requestId}
                    request={req}
                    onDecide={async (requestId, decision) => {
                      try {
                        await fetch(`http://localhost:5501/api/permission-response/${requestId}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ decision }),
                        });
                      } catch (e) {
                        console.error('提交授权决定失败', e);
                      }
                    }}
                    timeoutSeconds={60}
                  />
                ))}
                {pendingQuestions.map(req => (
                  <UserQuestionDialog
                    key={req.requestId}
                    request={req}
                    onAnswer={(requestId, answer) => {
                      sendMessage({ type: 'user_answer', requestId, answer });
                      // 提交后从 UI 移除 (或者等待后端 confirmation，这里为了交互流畅先移除)
                      // 但通常这种提问是阻塞的，我们可以保留状态直到进程继续
                      // 这里选择保留 2 秒再移除，或者干脆由切换任务触发重置
                      setTimeout(() => {
                        setPendingQuestions(prev => prev.filter(p => p.requestId !== requestId));
                      }, 2000);
                    }}
                  />
                ))}
              </div>
            )}

            {/* ── 任务输出 Tab ── */}
            {activeTab === 'output' && (
              <>
                {!isExpanded && (
                  <>
                    {/* 已完成任务且有最终结果：只展示干净的最终结果 */}
                    {task.status === 'Completed' && task.finalResult ? (
                      <div className="terminal-preview-overlay final-result-overlay">
                        <div className="preview-header">
                          <Space>
                            <CheckCircleFilled style={{ color: '#3FB950' }} />
                            <span>任务完成 · 最终结果</span>
                          </Space>
                          <Button
                            type="default"
                            size="small"
                            icon={<ExpandAltOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetail();
                            }}
                          >
                            查看详情
                          </Button>
                        </div>
                        <div className="markdown-body preview-mode" style={{ padding: '16px 20px' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                            {cleanAnsi(task.finalResult).trim() || '（无输出内容）'}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      /* 非完成态或无 finalResult：保持原有预览行为 */
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
                  </>
                )}

                {isExpanded && showMarkdown && (
                  <div ref={markdownRef} className="markdown-body expanded-mode">
                    {totalLineCount > lineLimit && (
                      <div className="load-more-output-bar">
                        <Button 
                          type="link" 
                          size="small" 
                          onClick={() => setLineLimit(prev => prev + 300)}
                        >
                          加载更早的 300 行内容 (剩余 {totalLineCount - lineLimit} 行)
                        </Button>
                      </div>
                    )}
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
