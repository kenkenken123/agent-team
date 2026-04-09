import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Layout, List, Button, Select, Typography, Space,
  message, Popconfirm, Badge, Spin, Empty, Tooltip,
} from 'antd';

import {
  PlayCircleOutlined, StopOutlined, ReloadOutlined, PlusOutlined,
  RobotOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ExclamationCircleOutlined, DeleteOutlined, PictureOutlined
} from '@ant-design/icons';
import { Upload, Mentions, AutoComplete } from 'antd';

import { agentApi } from '../../api/agentApi';
import { taskApi } from '../../api/taskApi';
import { commonPathApi } from '../../api/commonPathApi';
import type { Agent, AgentTask, CommonPath } from '../../types';
import { useAppStore } from '../../stores/appStore';
import TerminalPanel from '../../components/Terminal/TerminalPanel';
import './Console.css';

const { Sider, Content } = Layout;
const { Text } = Typography;


const ConsolePage: React.FC = () => {
  const { selectedAgentId, setSelectedAgentId } = useAppStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [prompt, setPrompt] = useState('');
  const [launching, setLaunching] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [continueSession, setContinueSession] = useState<string | null>(null);
  const [commonPaths, setCommonPaths] = useState<CommonPath[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [selectedWorkingDirectory, setSelectedWorkingDirectory] = useState<string | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevSessionTaskCountRef = useRef(0);
  const prevSessionIdRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  const [currentTake, setCurrentTake] = useState(5);
  const [totalTasks, setTotalTasks] = useState(0);

  // 添加命令状态
  const [availableCommands, setAvailableCommands] = useState<string[]>([]);
  useEffect(() => {
    fetch('http://localhost:5501/api/commands')
      .then(res => res.json())
      .then(data => {
        if (data && data.commands) {
          setAvailableCommands(data.commands.map((c: string) => c.replace('/', '')));
        }
      })
      .catch(console.error);
  }, []);

  const currentSessionTasks = useMemo(() => {
    if (!selectedTask) return [];
    
    // 如果选中的任务有 SessionId，则展示该 Session 下的所有子任务
    if (selectedTask.claudeSessionId) {
      return tasks
        .filter(t => t.claudeSessionId === selectedTask.claudeSessionId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    
    // 如果选中的任务暂时还没分配 SessionId (刚启动)，则只展示该单条任务
    return [selectedTask];
  }, [tasks, selectedTask]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 只有真正新增了气泡，或者切换了左侧任务，或者刚发消息时，或者初始加载时，才向底部滚动
  useEffect(() => {
    const currentGroupId = selectedTask?.claudeSessionId || selectedTask?.id || null;
    let shouldScroll = false;

    if (isInitialLoadRef.current && currentSessionTasks.length > 0) {
      shouldScroll = true;
      isInitialLoadRef.current = false;
    } else if (launching) {
      shouldScroll = true;
    } else if (currentGroupId !== prevSessionIdRef.current) {
      shouldScroll = true;
    } else if (currentSessionTasks.length > prevSessionTaskCountRef.current) {
      shouldScroll = true;
    }

    if (shouldScroll) {
      setTimeout(() => {
        scrollToBottom();
      }, 300); // 添加一点延时，确保 xterm 的 dom 与高度被展开完成
    }

    prevSessionIdRef.current = currentGroupId;
    prevSessionTaskCountRef.current = currentSessionTasks.length;
  }, [currentSessionTasks, selectedTask, launching]);



  // 加载 Agent 列表和常用路径
  useEffect(() => {
    Promise.all([
      agentApi.getAll(),
      commonPathApi.getAll()
    ]).then(([agentsData, pathsData]) => {
      const activeAgents = agentsData.filter(a => a.isEnabled);
      setAgents(activeAgents);
      setCommonPaths(pathsData);
      // 如果当前没选，且有可用的 Agent，自动选第一个
      if (!selectedAgentId && activeAgents.length > 0) {
        setSelectedAgentId(activeAgents[0].id);
      }
    }).catch(err => {
      message.error('加载基础数据失败');
      console.error(err);
    });
  }, []);


  // 加载选中 Agent 的任务列表
  const loadTasks = useCallback(async (takeOverride?: number) => {
    if (!selectedAgentId) return;
    setLoadingTasks(true);
    try {
      const take = takeOverride || currentTake;
      const data = await taskApi.getAll({ agentId: selectedAgentId, skip: 0, take });
      setTasks(data.items);
      setTotalTasks(data.total);
      // 同步更新已选任务的状态
      setSelectedTask(prev => prev ? data.items.find((t: AgentTask) => t.id === prev.id) ?? prev : null);
    } finally {
      setLoadingTasks(false);
    }
  }, [selectedAgentId, currentTake]);

  useEffect(() => {
    setCurrentTake(5); // 重置选定 Agent 时的默认条数
  }, [selectedAgentId]);

  useEffect(() => {
    loadTasks();
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      await loadTasks();
    }, 2000); // 提高轮询频率以快速获取 SessionId
    return () => clearInterval(pollRef.current);
  }, [loadTasks]);


  // 左侧任务列表去重：如果是同一个 claudeSessionId，只保留最新的一条代表该会话
  const siderTasks = useMemo(() => {
    const map = new Map<string, AgentTask>();
    const singles: AgentTask[] = [];
    for (const t of tasks) {
      if (t.claudeSessionId) {
        const existing = map.get(t.claudeSessionId);
        if (!existing || new Date(t.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
          map.set(t.claudeSessionId, t);
        }
      } else {
        singles.push(t);
      }
    }
    return [...Array.from(map.values()), ...singles].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [tasks]);

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  useEffect(() => {
    if (selectedAgent) {
      const models = selectedAgent.allowedModels?.split(',') || [];
      setSelectedModel(''); // 默认使用系统缺省
      setSelectedWorkingDirectory(selectedAgent.workingDirectory);
    }
  }, [selectedAgent]);

  const handleLaunch = async () => {
    if (!selectedAgentId || !prompt.trim()) {
      message.warning('请选择 Agent 并输入任务指令');
      return;
    }

    // 如果没有手动选 continueSession，但当前选中的任务有 SessionId，则优先使用关联 Session
    const activeSessionId = continueSession || (selectedTask?.claudeSessionId ?? null);

    setLaunching(true);
    try {
      const task = await taskApi.create({
        agentId: selectedAgentId,
        prompt: prompt.trim(),
        resumeSessionId: activeSessionId || undefined,
        forceNewSession: !activeSessionId, // 关键：如果没有指定 Session，强制新开
        model: selectedModel,
        workingDirectory: selectedWorkingDirectory || undefined
      });
      
      message.success('任务已启动' + (activeSessionId ? ' (续写上下文)' : ''));
      setPrompt('');
      // 启动后立即清除用于显示“续写中”的标记，因为任务已经接管了 Session
      setContinueSession(null);

      // 这里的逻辑：启动后我们把这个新任务设为选中任务，后续的 conversationTasks 过滤就会带上它
      setSelectedTask(task);
      await loadTasks();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? '启动任务失败');
    } finally {
      setLaunching(false);
    }
  };



  const handleCancel = async (taskId: string) => {
    await taskApi.cancel(taskId);
    message.success('已发送取消指令');
    loadTasks();
  };

  const handleDeleteSession = async (task: AgentTask) => {
    try {
      await taskApi.deleteSession(task.claudeSessionId || undefined, !task.claudeSessionId ? task.id : undefined);
      message.success('会话已彻底删除');
      
      // 如果删除的是当前选中的会话下的任务，清空选中
      if (selectedTask?.claudeSessionId === task.claudeSessionId || selectedTask?.id === task.id) {
        setSelectedTask(null);
      }
      loadTasks();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? '删除会话失败');
    }
  };


  const handleStatusChange = useCallback((taskId: string, status: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: status as AgentTask['status'] } : t
    ));
    setSelectedTask(prev =>
      prev?.id === taskId ? { ...prev, status: status as AgentTask['status'] } : prev
    );
  }, []);

  const taskStatusIcon = (status: AgentTask['status']) => {
    switch (status) {
      case 'Running': return <Badge status="processing" />;
      case 'Completed': return <CheckCircleOutlined style={{ color: '#3FB950' }} />;
      case 'Failed': return <ExclamationCircleOutlined style={{ color: '#F85149' }} />;
      case 'Cancelled': return <CloseCircleOutlined style={{ color: '#8B949E' }} />;
      default: return <ClockCircleOutlined style={{ color: '#8B949E' }} />;
    }
  };


  return (

    <div className="console-page">
      <Layout className="console-main-layout">
        <Sider className="task-sider" width={280}>
          <div className="task-sider-header">
            <Select
              style={{ width: '100%' }}
              placeholder="选择 Agent"
              value={selectedAgentId}
              onChange={setSelectedAgentId}
              options={agents.map(a => ({
                label: (
                  <Space>
                    <RobotOutlined style={{ color: '#58A6FF' }} />
                    {a.name}
                  </Space>
                ),
                value: a.id,
              }))}
            />
          </div>
          <div className="task-sider-title">
            <Text style={{ color: '#8B949E', fontSize: 12 }}>会话历史 ({siderTasks.length})</Text>
            {selectedAgent && (
              <Tooltip title="新增会话">
                <Button 
                  type="text" 
                  size="small" 
                  icon={<PlusOutlined />} 
                  onClick={() => {
                    setSelectedTask(null);
                    setContinueSession(null);
                  }} 
                />
              </Tooltip>
            )}
          </div>
          <Spin spinning={loadingTasks && tasks.length === 0}>
            <List
              className="task-list"
              dataSource={siderTasks}
              renderItem={task => (
                <List.Item
                  className={`task-list-item ${selectedTask?.id === task.id ? 'active' : ''}`}
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="task-item-content">
                    <div className="task-item-header">
                      <Space size={6}>
                        {taskStatusIcon(task.status)}
                        <Text strong style={{ color: '#C9D1D9', fontSize: 13 }}>
                          {task.claudeSessionId ? `会话 #${task.claudeSessionId.substring(0, 6)}` : `任务 #${task.id.substring(0, 6)}`}
                        </Text>
                      </Space>
                      <Space size={4}>
                        {task.status === 'Running' && (
                          <Button
                            type="text" size="small" danger icon={<StopOutlined />}
                            onClick={(e) => { e.stopPropagation(); handleCancel(task.id); }}
                          />
                        )}
                        {task.status !== 'Running' && task.claudeSessionId && (
                          <Button
                            type="text" size="small" icon={<ReloadOutlined />}
                            onClick={(e) => { e.stopPropagation(); setContinueSession(task.claudeSessionId || null); }}
                          />
                        )}
                        <Popconfirm
                          title={task.status === 'Running' ? "会话中仍有任务在运行，确定要强制终止并删除整个会话吗？" : "确定删除此会话及其所有历史记录？"}
                          onConfirm={(e) => { e?.stopPropagation(); handleDeleteSession(task); }}
                          onCancel={(e) => e?.stopPropagation()}
                          okText="彻底删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            type="text"
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                            title="删除会话"
                          />
                        </Popconfirm>
                      </Space>


                    </div>
                    <div className="task-prompt-preview">
                      {task.claudeSessionId ? `最新: ${task.prompt}` : task.prompt}
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </Spin>
        </Sider>

        <Content className="chat-container">
          <div className="chat-flow">
            {!selectedTask ? (
              <div className="chat-empty">
                <Empty description="请从左侧选择任务或开始新对话" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              // 找出所有具有相同 SessionId 的任务，或者如果是单次任务则只显示选中的
              currentSessionTasks.map(task => (
                <div className="chat-message-group" key={task.id}>
                  <div className="message-bubble user-bubble">
                    <div className="bubble-content">{task.prompt}</div>
                  </div>
                  <div className="message-bubble assistant-bubble">
                    <TerminalPanel task={task} onStatusChange={handleStatusChange} />
                  </div>
                </div>
              ))
            )}

            {launching && (
              <div className="chat-message-group">
                <div className="message-bubble user-bubble" style={{ opacity: 0.7 }}>
                  <div className="bubble-content">
                    {prompt} <Spin size="small" style={{ marginLeft: 8 }} />
                  </div>
                </div>
                <div className="message-bubble assistant-bubble" style={{ padding: 16 }}>
                  <Typography.Text type="secondary">
                    <Spin size="small" style={{ marginRight: 8 }} /> 正在建立连接并等待 Agent 响应...
                  </Typography.Text>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>


          <div className="chat-input-wrapper">
            {selectedAgent && (
              <div style={{ padding: '0 16px', marginBottom: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: '#8B949E', fontSize: 12 }}>执行模型:</Text>
                  <Select
                    size="small"
                    value={selectedModel}
                    onChange={setSelectedModel}
                    style={{ width: 180, fontSize: 12 }}
                    options={[
                      { label: '系统默认 (本地配置)', value: '' },
                      ...(selectedAgent.allowedModels?.split(',') || []).map(m => ({ label: m, value: m }))
                    ]}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: '#8B949E', fontSize: 12 }}>工作目录:</Text>
                  <AutoComplete
                    size="small"
                    value={selectedWorkingDirectory}
                    onChange={setSelectedWorkingDirectory}
                    style={{ width: 280, fontSize: 12 }}
                    placeholder="输入或选择工作目录"
                    options={[
                      ...(selectedAgent.workingDirectory ? [{ label: `默认: ${selectedAgent.workingDirectory}`, value: selectedAgent.workingDirectory }] : []),
                      ...commonPaths.map(p => ({ label: `${p.name} (${p.path})`, value: p.path }))
                    ]}
                    filterOption={(inputValue, option) =>
                      option?.label?.toString().toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                    }
                  />
                  {!selectedWorkingDirectory && !selectedAgent.workingDirectory && (
                    <Text type="danger" style={{ fontSize: 11 }}>* 必须指定目录才能启动</Text>
                  )}
                </div>
              </div>
            )}
            <div className="chat-input-bar">
              {continueSession && (
                <div className="continue-hint-badge">
                  续写会话: {continueSession.substring(0, 8)}
                  <Button type="link" size="small" onClick={() => setContinueSession(null)}>取消</Button>
                </div>
              )}
              <Mentions
                className="chat-textarea"
                value={prompt}
                onChange={setPrompt}
                placeholder="给 Agent 发送指令... (可用 / 唤起智能补充指令) (Ctrl+Enter 发送)"
                autoSize={{ minRows: 1, maxRows: 6 }}
                prefix="/"
                options={availableCommands.map(cmd => ({
                  value: cmd,
                  label: `/${cmd}`
                }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    handleLaunch();
                  }
                }}
                onPaste={async (e) => {
                  const items = e.clipboardData.items;
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      const file = items[i].getAsFile();
                      if (file) {
                        message.loading({ content: '正在上传粘粘的图片...', key: 'paste-upload' });
                        const formData = new FormData();
                        formData.append('file', file);
                        if (selectedAgentId) formData.append('agentId', selectedAgentId);
                        
                        try {
                          const res = await fetch('http://localhost:5501/api/Upload', {
                            method: 'POST', body: formData
                          });
                          const data = await res.json();
                          if (data.url) {
                            message.success({ content: '粘贴的图片已上传！', key: 'paste-upload' });
                            setPrompt(prev => prev ? `${prev}\n请查看这张图片并分析: ${data.url}` : `请查看这张图片并分析: ${data.url}`);
                          }
                        } catch (error) {
                          message.error({ content: '粘贴上传失败', key: 'paste-upload' });
                        }
                      }
                    }
                  }
                }}
                disabled={!selectedAgentId}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                <Upload
                  name="file"
                  action="http://localhost:5501/api/Upload"
                  data={selectedAgentId ? { agentId: selectedAgentId } : undefined}
                  showUploadList={false}
                  onChange={(info) => {
                    if (info.file.status === 'uploading') {
                      message.loading({ content: '图片上传中...', key: 'uploading' });
                    }
                    if (info.file.status === 'done') {
                      message.success({ content: '图片已添加！', key: 'uploading' });
                      const path = info.file.response.url;
                      setPrompt(prev => prev ? `${prev}\n请查看这张图片并分析: ${path}` : `请查看这张图片并分析: ${path}`);
                    } else if (info.file.status === 'error') {
                      message.error({ content: '图片上传失败', key: 'uploading' });
                    }
                  }}
                >
                  <Button
                    icon={<PictureOutlined />}
                    style={{ marginTop: 4, background: 'transparent', borderColor: '#30363D', color: '#8B949E' }}
                    disabled={!selectedAgentId}
                    title="上传图片供 Claude 分析"
                  />
                </Upload>

                {launching || selectedTask?.status === 'Running' ? (
                  <Button
                    className="send-button"
                    type="primary"
                    danger
                    icon={<StopOutlined />}
                    onClick={() => {
                      if (selectedTask) handleCancel(selectedTask.id);
                      setLaunching(false);
                    }}
                  >
                    停止任务
                  </Button>
                ) : (
                  <Button
                    className="send-button"
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    loading={launching}
                    onClick={handleLaunch}
                    disabled={!selectedAgentId || !prompt.trim() || !selectedWorkingDirectory}
                  >
                    发送 [Ctrl+Enter]
                  </Button>
                )}
              </div>
            </div>
            <div className="input-footer-text">
              Claude Code 专注于代码执行和管理。按 Ctrl+Enter 快速启动。
            </div>
          </div>
        </Content>
      </Layout>
    </div>
  );
};

export default ConsolePage;

