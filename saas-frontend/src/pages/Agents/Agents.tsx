import { useState, useEffect, useRef } from 'react';
import { Card, Button, Input, Select, Row, Col, Space, Typography, message, Tag, Switch, Avatar, Upload, Popconfirm, AutoComplete } from 'antd';
import {
  PlayCircleOutlined,
  LoadingOutlined,
  PlusOutlined,
  MessageOutlined,
  UserOutlined,
  RobotOutlined,
  DownOutlined,
  UpOutlined,
  DeleteOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { agentsApi, tasksApi, filesApi } from '../../api/saasApi';
import MarkdownRenderer from '../../components/MarkdownRenderer';

const { Title } = Typography;
const { TextArea } = Input;

interface Task {
  id: string;
  agentId: string;
  agentName: string;
  prompt: string;
  status: string;
  claudeSessionId?: string;
  finalResult?: string;
  createdAt: string;
  sessionTitle?: string;
  sessionDir?: string;
}

interface ChatSession {
  sessionId: string;
  title: string;
  createdAt: string;
  lastUpdatedAt: string;
  tasks: Task[];
}

const getSessionStats = (session: any) => {
  if (!session || !session.tasks || session.tasks.length === 0) return null;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreate = 0;
  let totalRequests = 0;

  session.tasks.forEach((t: any) => {
    totalInput += t.inputTokens || 0;
    totalOutput += t.outputTokens || 0;
    totalCacheRead += t.cacheReadTokens || 0;
    totalCacheCreate += t.cacheCreationTokens || 0;
    totalRequests += t.requestCount || 0;
  });

  const totalTokens = totalInput + totalOutput;
  const cost = ((totalInput - totalCacheRead) * 3 + totalCacheRead * 0.3 + totalOutput * 15) / 1000000;

  return {
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheCreate,
    totalTokens,
    totalRequests,
    cost: cost.toFixed(4)
  };
};

export default function Agents() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [implicitAgentId, setImplicitAgentId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; path: string }[]>([]);
  const [sessionDir, setSessionDir] = useState('');
  const [dirOptions, setDirOptions] = useState<{ value: string }[]>([]);
  
  const [taskPrompt, setTaskPrompt] = useState('');
  const [planMode, setPlanMode] = useState(false);
  const [isStartingTask, setIsStartingTask] = useState(false);
  const [activeModel, setActiveModel] = useState('claude-3-7-sonnet-20250219');
  const [models, setModels] = useState<string[]>([]);
  
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [runningTaskOutput, setRunningTaskOutput] = useState('');
  
  const wsRef = useRef<WebSocket | null>(null);
  const wsTaskIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const activeSessionRef = useRef<ChatSession | null>(null);
  const implicitAgentIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    implicitAgentIdRef.current = implicitAgentId;
  }, [implicitAgentId]);

  const init = async () => {
    try {
      const agents = await agentsApi.getAgents();
      let agent = agents[0];
      
      if (!agent) {
        const templates = await agentsApi.getTemplates();
        const defTmp = templates[0];
        if (defTmp) {
          agent = await agentsApi.createAgent({
            name: "专属助手",
            templateId: defTmp.id,
            workingDirectory: "",
            allowedModels: "claude-3-7-sonnet-20250219",
            maxTurns: 30,
          });
        }
      }
      
      if (agent) {
        setImplicitAgentId(agent.id);
        loadSessions(agent.id);
      }
      
      const mList = await agentsApi.getModels();
      setModels(mList || []);
      if (mList && mList.length > 0) {
        setActiveModel(mList[0]);
      }
    } catch (err: any) {
      message.error(err.message || '系统初始化失败');
    }
  };

  const loadSessions = async (agentId: string) => {
    try {
      const res = await tasksApi.getTasks({ agentId, take: 200 });
      const allTasks: Task[] = res.items || [];
      
      const groups: Record<string, Task[]> = {};
      allTasks.forEach((t) => {
        const sId = t.claudeSessionId || `temp_${t.id}`;
        if (!groups[sId]) {
          groups[sId] = [];
        }
        groups[sId].push(t);
      });
      
      const sessionList: ChatSession[] = Object.keys(groups).map((sId) => {
        const tasksInGroup = groups[sId].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const firstTask = tasksInGroup[0];
        const lastTask = tasksInGroup[tasksInGroup.length - 1];
        
        let title = firstTask.sessionTitle || firstTask.prompt;
        if (title.length > 25) title = title.substring(0, 22) + '...';
        
        return {
          sessionId: sId,
          title: title,
          createdAt: firstTask.createdAt,
          lastUpdatedAt: lastTask.createdAt,
          tasks: tasksInGroup,
        };
      });
      
      sessionList.sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
      
      setSessions(sessionList);
      
      const currentActive = activeSessionRef.current;
      if (currentActive) {
        const updatedActive = sessionList.find(s => s.sessionId === currentActive.sessionId);
        if (updatedActive) {
          setActiveSession(updatedActive);
          const runningTask = updatedActive.tasks.find(t => t.status === 'Running' || t.status === 'Pending');
          if (runningTask) {
            connectWebSocket(runningTask.id);
          }
        }
      }
    } catch (err: any) {
      message.error('加载会话失败');
    }
  };

  const loadDirectoryOptions = async () => {
    try {
      const entries = await filesApi.listFiles('');
      const dirs = (entries || [])
        .filter((item: any) => item.type === 'directory' && item.name !== '.temp')
        .map((item: any) => ({ value: item.name }));
      setDirOptions(dirs);
    } catch (err) {
      console.error('加载快捷目录列表失败', err);
    }
  };

  useEffect(() => {
    init();
    loadDirectoryOptions();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession, runningTaskOutput]);

  const selectSession = async (session: ChatSession) => {
    setActiveSession(session);
    setRunningTaskOutput('');
    wsTaskIdRef.current = null;
    if (wsRef.current) {
      wsRef.current.close();
    }

    const lastTask = session.tasks[session.tasks.length - 1];
    setSessionDir(lastTask?.sessionDir || '');
    
    const runningTask = session.tasks.find(t => t.status === 'Running' || t.status === 'Pending');
    if (runningTask) {
      try {
        const res = await tasksApi.getTaskOutput(runningTask.id);
        const cleanText = (res.content || '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        setRunningTaskOutput(cleanText || (runningTask.status === 'Pending' ? '任务启动中...' : ''));
        connectWebSocket(runningTask.id);
      } catch (err) {
      }
    }
  };


  const connectWebSocket = (taskId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && wsTaskIdRef.current === taskId) {
      return;
    }

    if (wsRef.current) wsRef.current.close();
    wsTaskIdRef.current = taskId;

    const wsUrl = `ws://localhost:5501/ws/task/${taskId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (implicitAgentIdRef.current) loadSessions(implicitAgentIdRef.current);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'output' && data.content) {
          const cleanChunk = data.content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
          setRunningTaskOutput((prev) => prev + cleanChunk);
          logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else if (data.type === 'status' && data.status) {
          if (implicitAgentIdRef.current) loadSessions(implicitAgentIdRef.current);
        }
      } catch (e) {
      }
    };
  };

  const handleNewSession = () => {
    setActiveSession(null);
    setRunningTaskOutput('');
    setTaskPrompt('');
    wsTaskIdRef.current = null;
    if (wsRef.current) wsRef.current.close();
  };

  const handleSendPrompt = async () => {
    if (!implicitAgentId || !taskPrompt.trim()) return;
    setIsStartingTask(true);
    
    const isNew = !activeSession || activeSession.sessionId.startsWith('temp_');
    const resumeSessionId = !isNew ? activeSession?.sessionId : undefined;
    
    setRunningTaskOutput('任务启动中...');
    
    let finalPrompt = taskPrompt.trim();
    if (uploadedFiles.length > 0) {
      const fileListStr = uploadedFiles.map(f => f.name).join(', ');
      finalPrompt += `\n\n[已通过聊天框上传的关联文件（已保存在用户根目录的 .temp/ 下）: ${fileListStr}]`;
    }
    
    try {
      const res = await tasksApi.createTask({
        agentId: implicitAgentId,
        prompt: finalPrompt,
        planMode: planMode,
        terminalType: 'powershell',
        model: activeModel,
        forceNewSession: isNew,
        resumeSessionId: resumeSessionId,
        workingDirectory: sessionDir,
      });
      
      message.success('指令发送成功！');
      setTaskPrompt('');
      setUploadedFiles([]);
      
      if (isNew) {
        const tempSess: ChatSession = {
          sessionId: res.claudeSessionId || res.id,
          title: res.sessionTitle || (res.prompt.length > 25 ? res.prompt.substring(0, 22) + '...' : res.prompt),
          createdAt: res.createdAt,
          lastUpdatedAt: res.createdAt,
          tasks: [res],
        };
        setActiveSession(tempSess);
      }
      
      await loadSessions(implicitAgentId);
      connectWebSocket(res.id);
    } catch (err: any) {
      message.error(err.message || '发送指令失败');
    } finally {
      setIsStartingTask(false);
    }
  };

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    if (!newTitle.trim() || sessionId.startsWith('temp_')) return;
    try {
      await tasksApi.updateSessionTitle(sessionId, newTitle.trim());
      message.success('会话标题已更新');
      
      setSessions(prev => prev.map(s => {
        if (s.sessionId === sessionId) {
          return { ...s, title: newTitle.trim() };
        }
        return s;
      }));
      if (activeSession && activeSession.sessionId === sessionId) {
        setActiveSession(prev => prev ? { ...prev, title: newTitle.trim() } : null);
      }
    } catch (err: any) {
      message.error(err.message || '修改会话标题失败');
    }
  };

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      message.loading({ content: '正在上传文件...', key: 'uploading' });
      const res = await filesApi.uploadFile(formData);
      message.success({ content: `文件 ${file.name} 上传成功，已存入 .temp 目录`, key: 'uploading' });
      setUploadedFiles(prev => [...prev, { name: res.fileName, path: res.relativePath }]);
    } catch (err: any) {
      message.error({ content: err.message || '文件上传失败', key: 'uploading' });
    }
    return false; // 阻止 antd 自动上传
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!implicitAgentId || isStartingTask) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    let hasFile = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          hasFile = true;
          let finalFile = file;
          if (!file.name || file.name === 'image.png') {
            const ext = file.type.split('/')[1] || 'png';
            const randomName = `pasted_file_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
            finalFile = new File([file], randomName, { type: file.type });
          }
          await handleUpload(finalFile);
        }
      }
    }

    if (hasFile) {
      e.preventDefault();
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      message.loading({ content: '正在发送中止指令...', key: 'cancelling' });
      await tasksApi.cancelTask(taskId);
      message.success({ content: '中止指令发送成功！', key: 'cancelling' });
      if (implicitAgentId) loadSessions(implicitAgentId);
    } catch (err: any) {
      message.error({ content: err.message || '中止任务失败', key: 'cancelling' });
    }
  };

  const handleDeleteSession = async (session: ChatSession) => {
    try {
      const firstTask = session.tasks[0];
      await tasksApi.deleteSession({
        sessionId: session.sessionId.startsWith('temp_') ? undefined : session.sessionId,
        taskId: session.sessionId.startsWith('temp_') ? firstTask.id : undefined,
      });
      message.success('会话已删除');
      if (activeSession?.sessionId === session.sessionId) {
        setActiveSession(null);
        setRunningTaskOutput('');
      }
      if (implicitAgentId) loadSessions(implicitAgentId);
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const toggleLog = async (taskId: string) => {
    const isExpanded = !!expandedLogs[taskId];
    if (isExpanded) {
      setExpandedLogs(prev => ({ ...prev, [taskId]: false }));
    } else {
      try {
        const res = await tasksApi.getTaskOutput(taskId);
        const cleanText = (res.content || '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        (window as any)[`log_${taskId}`] = cleanText || '(无日志输出)';
        setExpandedLogs(prev => ({ ...prev, [taskId]: true }));
      } catch (err) {
        message.error('加载日志文件失败');
      }
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
      <Row style={{ flex: 1, minHeight: 0 }} gutter={24}>
        <Col span={6} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={handleNewSession}
            style={{ marginBottom: 12, height: 40 }}
            className="glow-btn"
          >
            + 新建会话
          </Button>

          <Card
            bordered={false}
            className="glass-card"
            style={{ flex: 1, overflowY: 'auto' }}
            bodyStyle={{ padding: '12px 8px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sessions.map((sess) => {
                const isRunning = sess.tasks.some(t => t.status === 'Running' || t.status === 'Pending');
                return (
                  <div
                    key={sess.sessionId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: activeSession?.sessionId === sess.sessionId ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                      border: activeSession?.sessionId === sess.sessionId ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.25s',
                    }}
                    onClick={() => selectSession(sess)}
                  >
                    <Space size={8} style={{ overflow: 'hidden', flex: 1 }}>
                      <MessageOutlined style={{ color: isRunning ? '#10b981' : '#a855f7' }} />
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>
                          {sess.title}
                        </span>
                        {isRunning && (
                          <span style={{ marginLeft: 6, color: '#10b981', fontSize: 10 }}>
                            <LoadingOutlined />
                          </span>
                        )}
                      </div>
                    </Space>
                    
                    <Popconfirm
                      title="确定删除此会话吗？"
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        handleDeleteSession(sess);
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                      okText="确认"
                      cancelText="取消"
                    >
                      <DeleteOutlined
                        style={{ color: 'rgba(255,255,255,0.25)', padding: 4 }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#ff4d4f')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
                      />
                    </Popconfirm>
                  </div>
                );
              })}
              {sessions.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                  无历史会话记录，点击上方开启新聊天
                </div>
              )}
            </div>
          </Card>
        </Col>

        <Col span={18} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Card
            bordered={false}
            className="glass-card"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12, marginBottom: 12 }}>
              <Space>
                <Title
                  level={4}
                  style={{ margin: 0, fontWeight: 600, color: '#fff' }}
                  editable={activeSession && !activeSession.sessionId.startsWith('temp_') ? {
                    onChange: (val) => handleRenameSession(activeSession.sessionId, val),
                    triggerType: ['icon', 'text'],
                    tooltip: '点击修改会话标题',
                  } : false}
                >
                  {activeSession ? activeSession.title : '全新开发会话'}
                </Title>
                {activeSession && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                    ID: {activeSession.sessionId.substring(0, 8)}...
                  </span>
                )}
              </Space>
            </div>

            {activeSession && (() => {
              const stats = getSessionStats(activeSession);
              if (!stats) return null;
              return (
                <div style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid rgba(255,255,255,0.05)', 
                  borderRadius: 8, 
                  padding: '8px 12px', 
                  display: 'flex', 
                  gap: 16, 
                  fontSize: 12, 
                  flexWrap: 'wrap',
                  marginBottom: 16,
                  alignItems: 'center'
                }}>
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>总计消耗: </span>
                    <span style={{ color: '#c084fc', fontWeight: 600 }}>{stats.totalTokens.toLocaleString()} Tokens</span>
                  </div>
                  <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', height: 12 }} />
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>输入 / 输出: </span>
                    <span style={{ color: '#fff' }}>{stats.totalInput.toLocaleString()} / {stats.totalOutput.toLocaleString()}</span>
                  </div>
                  {stats.totalCacheRead > 0 && (
                    <>
                      <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', height: 12 }} />
                      <div>
                        <span style={{ color: 'rgba(255,255,255,0.45)' }}>缓存命中: </span>
                        <span style={{ color: '#10b981', fontWeight: 600 }}>{stats.totalCacheRead.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', height: 12 }} />
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>API 交互: </span>
                    <span style={{ color: '#fff' }}>{stats.totalRequests} 次</span>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>预估消费: </span>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>${stats.cost}</span>
                  </div>
                </div>
              );
            })()}

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8, marginBottom: 16 }}>
              {activeSession ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {activeSession.tasks.map((task) => {
                    const isTaskRunning = task.status === 'Running' || task.status === 'Pending';
                    const hasResult = !!task.finalResult;
                    const isExpanded = !!expandedLogs[task.id];
                    
                    return (
                      <div key={task.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <div style={{ display: 'flex', gap: 10, maxWidth: '75%' }}>
                            <Card
                              bodyStyle={{ padding: '10px 14px' }}
                              style={{
                                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
                                border: '1px solid rgba(168, 85, 247, 0.12)',
                                borderRadius: '16px 0 16px 16px',
                              }}
                            >
                              <div style={{ color: '#fff', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                                {task.prompt}
                              </div>
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'right', marginTop: 4 }}>
                                {new Date(task.createdAt).toLocaleTimeString()}
                              </div>
                            </Card>
                            <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#a855f7' }} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                          <div style={{ display: 'flex', gap: 10, width: '90%', maxWidth: '90%' }}>
                            <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#00a2ae' }} />
                            <div style={{ flex: 1 }}>
                              <Card
                                bodyStyle={{ padding: '12px 16px' }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 0,
                                  boxShadow: 'none',
                                }}
                              >
                                {hasResult && (
                                  <MarkdownRenderer content={task.finalResult || ''} />
                                )}

                                {isTaskRunning && (
                                  <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                      <div style={{ color: '#10b981', fontSize: 13 }}>
                                        <LoadingOutlined style={{ marginRight: 6 }} /> Claude 正在实时处理执行中...
                                      </div>
                                      <Button
                                        type="primary"
                                        danger
                                        size="small"
                                        onClick={() => handleCancelTask(task.id)}
                                        style={{ fontSize: 11 }}
                                      >
                                        终止任务
                                      </Button>
                                    </div>
                                    <div
                                      style={{
                                        background: '#0e0f11',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        fontFamily: 'Consolas, monospace',
                                        fontSize: 12,
                                        color: '#e2e8f0',
                                        maxHeight: 280,
                                        overflowY: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        border: '1px solid rgba(255,255,255,0.03)',
                                      }}
                                    >
                                      {runningTaskOutput || '正在初始化进程并开启流日志通道...'}
                                      <div ref={logEndRef} />
                                    </div>
                                  </div>
                                )}

                                {!hasResult && !isTaskRunning && (
                                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                                    任务退出状态: <Tag color={task.status === 'Completed' ? 'green' : 'red'}>{task.status}</Tag>
                                  </div>
                                )}

                                {!isTaskRunning && (
                                  <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
                                    <Button
                                      type="link"
                                      size="small"
                                      icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                                      onClick={() => toggleLog(task.id)}
                                      style={{ padding: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}
                                    >
                                      {isExpanded ? '折叠底层构建日志' : '查看完整开发日志'}
                                    </Button>
                                    
                                    {isExpanded && (
                                      <pre
                                        style={{
                                          marginTop: 8,
                                          background: '#040508',
                                          borderRadius: '6px',
                                          padding: '10px',
                                          fontFamily: 'Consolas, monospace',
                                          fontSize: 11,
                                          color: '#87d068',
                                          maxHeight: 320,
                                          overflowY: 'auto',
                                          whiteSpace: 'pre-wrap',
                                          border: '1px solid rgba(255,255,255,0.05)',
                                        }}
                                      >
                                        {(window as any)[`log_${task.id}`] || '正在加载日志内容...'}
                                      </pre>
                                    )}
                                  </div>
                                )}
                              </Card>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'rgba(255,255,255,0.25)' }}>
                  <MessageOutlined style={{ fontSize: 48, marginBottom: 16, color: '#a855f7' }} />
                  <span style={{ fontSize: 16, fontWeight: 500 }}>欢迎使用 Claude 协作聊天室</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
                    在下方输入您希望执行的开发指令即可自动开启新会话。
                  </span>
                </div>
              )}
            </div>

            <div style={{ background: 'rgba(18, 18, 20, 0.35)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: 13 }}>模型:</span>
                <Select
                  value={activeModel}
                  onChange={(val) => setActiveModel(val)}
                  style={{ width: 200 }}
                  size="small"
                >
                  {models.map((m) => (
                    <Select.Option key={m} value={m}>{m}</Select.Option>
                  ))}
                </Select>
                
                <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 16 }}>
                  <Switch checked={planMode} onChange={(val) => setPlanMode(val)} size="small" />
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginLeft: 6 }}>
                    分析模式 (仅分析，不修改文件)
                  </span>
                </span>

                <span style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: 13, marginLeft: 16 }}>启动目录:</span>
                <AutoComplete
                  options={dirOptions}
                  value={sessionDir}
                  onChange={(val) => {
                    if (val.includes('..') || val.includes(':')) {
                      message.warning({ content: '目录必须在您的专属主目录下，禁止包含 .. 或盘符！', key: 'dir-warn' });
                      return;
                    }
                    setSessionDir(val);
                  }}
                  disabled={!!activeSession && activeSession.tasks && activeSession.tasks.length > 0}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  style={{ width: 220 }}
                >
                  <Input
                    placeholder="快捷选择或输入子目录"
                    style={{ 
                      background: 'rgba(255,255,255,0.01)', 
                      color: '#fff', 
                      border: '1px solid rgba(255,255,255,0.08)', 
                      borderRadius: 6 
                    }}
                    size="small"
                  />
                </AutoComplete>
              </div>

              {uploadedFiles.length > 0 && (
                <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: 12 }}>已上传文件:</span>
                  {uploadedFiles.map((file, idx) => (
                    <Tag
                      key={idx}
                      closable
                      onClose={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                      color="purple"
                      style={{ fontSize: 11 }}
                    >
                      {file.name} (保存在 .temp/)
                    </Tag>
                  ))}
                </div>
              )}

              <TextArea
                rows={3}
                placeholder={activeSession ? "继续在此会话中发送问题或开发指令... (按 Ctrl+Enter 发送)" : "描述您想让 Claude 执行的开发指令... (按 Ctrl+Enter 发送)"}
                value={taskPrompt}
                onChange={(e) => setTaskPrompt(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    if (!isStartingTask && taskPrompt.trim() && implicitAgentId) {
                      handleSendPrompt();
                    }
                  }
                }}
                style={{ 
                  background: 'rgba(255, 255, 255, 0.01)', 
                  color: '#fff', 
                  border: '1px solid rgba(255,255,255,0.06)', 
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginBottom: 8 
                }}
                disabled={isStartingTask}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Upload
                  beforeUpload={handleUpload}
                  showUploadList={false}
                >
                  <Button
                    icon={<PaperClipOutlined />}
                    disabled={isStartingTask || !implicitAgentId}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.65)' }}
                  >
                    上传文件
                  </Button>
                </Upload>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleSendPrompt}
                  loading={isStartingTask}
                  className="glow-btn"
                  disabled={!taskPrompt.trim() || !implicitAgentId}
                  style={{ borderRadius: 20 }}
                >
                  发送指令
                </Button>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
