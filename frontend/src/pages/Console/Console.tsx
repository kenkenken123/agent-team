import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Layout, Button, Select, Typography, Space,
  message, Popconfirm, Badge, Spin, Empty, Tooltip, Input, Switch,
  Modal,
} from 'antd';

import {
  PlayCircleOutlined, StopOutlined, ReloadOutlined, PlusOutlined,
  RobotOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ExclamationCircleOutlined, DeleteOutlined, PictureOutlined,
  PushpinOutlined, PushpinFilled, DownOutlined, UpOutlined, SearchOutlined, BranchesOutlined,
  SendOutlined, FolderOutlined, DesktopOutlined, TeamOutlined,
} from '@ant-design/icons';
import { Upload, Mentions, AutoComplete } from 'antd';

import { agentApi } from '../../api/agentApi';
import { agentGroupApi } from '../../api/agentGroupApi';
import { taskApi } from '../../api/taskApi';
import { commonPathApi } from '../../api/commonPathApi';
import { terminalApi } from '../../api/terminalApi';
import FileTreeDrawer from '../../components/FileTreeDrawer';
import type { Agent, AgentTask, CommonPath, AgentGroup } from '../../types';
import { useAppStore } from '../../stores/appStore';
import TerminalPanel from '../../components/Terminal/TerminalPanel';
import { GitDrawer } from '../../components/Git';
import './Console.css';

const { Sider, Content } = Layout;
const { Text } = Typography;


const ConsolePage: React.FC = () => {
  const { selectedAgentId, setSelectedAgentId, selectedSessionId, setSelectedSessionId, dataSyncVersion, bumpDataSync, queuedMessages, setQueuedMessages, addQueuedMessage, clearQueuedMessages, optimizePrompt, setOptimizePrompt, selectedGroupId, setSelectedGroupId } = useAppStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [prompt, setPrompt] = useState('');
  const [pastedImages, setPastedImages] = useState<{id: string, url: string}[]>([]);
  const [launching, setLaunching] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [continueSession, setContinueSession] = useState<string | null>(null);
  const [commonPaths, setCommonPaths] = useState<CommonPath[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [selectedWorkingDirectory, setSelectedWorkingDirectory] = useState<string | undefined>(undefined);
  const [savedModels, setSavedModels] = useState<Record<string, string>>({}); // sessionId -> model
  const [gitDrawerVisible, setGitDrawerVisible] = useState(false);
  const [fileTreeDrawerVisible, setFileTreeDrawerVisible] = useState(false);
  const [openingTerminal, setOpeningTerminal] = useState(false);
  const [dragOverInput, setDragOverInput] = useState(false);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const draggedFilePathRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevSessionTaskCountRef = useRef(0);
  const prevSessionIdRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);
  const prevAgentIdRef = useRef<string | undefined>(undefined); // 用于追踪 Agent 切换，防止工作目录被意外重置

  const autoLaunchTaskIdRef = useRef<string | null>(null);

  const [currentTake, setCurrentTake] = useState(5);
  const [totalTasks, setTotalTasks] = useState(0);
  const [showAllAgents, setShowAllAgents] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');

  const [autoIdentifyAgent] = useState(false); // 固定为 false，UI 已移除
  const [planMode, setPlanMode] = useState(false);

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

  const [sessionTaskLimit, setSessionTaskLimit] = useState(5);

  const currentSessionTasks = useMemo(() => {
    if (!selectedTask) return [];

    // 如果选中的任务有 SessionId，则展示该 Session 下的子任务
    if (selectedTask.claudeSessionId) {
      const filtered = tasks
        .filter(t => t.claudeSessionId === selectedTask.claudeSessionId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return filtered.slice(-sessionTaskLimit);
    }

    // 如果选中的任务暂时还没分配 SessionId (刚启动)，则只展示该单条任务
    return [selectedTask];
  }, [tasks, selectedTask, sessionTaskLimit]);

  const hasMoreSessionTasks = useMemo(() => {
    if (!selectedTask?.claudeSessionId) return false;
    const count = tasks.filter(t => t.claudeSessionId === selectedTask.claudeSessionId).length;
    return count > sessionTaskLimit;
  }, [tasks, selectedTask, sessionTaskLimit]);

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
      commonPathApi.getAll(),
      agentGroupApi.getAll()
    ]).then(([agentsData, pathsData, groupsData]) => {
      const activeAgents = agentsData.filter(a => a.isEnabled);
      setAgents(activeAgents);
      setCommonPaths(pathsData);
      setGroups(groupsData);

      // 如果上次选择的工作组不存在于当前列表中，则清空
      if (selectedGroupId && !groupsData.find(g => g.id === selectedGroupId)) {
        setSelectedGroupId(null);
      }

      // 如果当前没选，且有可用的 Agent，自动选第一个
      // 注意：不设置 prevAgentIdRef，让下面的 useEffect 自然触发并填充模型/工作目录
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

      // Bug2: 始终从最新数据中同步 selectedTask 的状态
      if (selectedSessionId) {
        // 从看板或管家跳转定位：支持匹配 SessionId 或 TaskId
        const found = data.items.find(t => t.claudeSessionId === selectedSessionId || t.id === selectedSessionId);
        if (found) {
          setSelectedTask(found);
          setSelectedSessionId(null);
        } else {
          setSelectedTask(prev => prev ? data.items.find((t: AgentTask) => t.id === prev.id) ?? prev : null);
        }
      } else {
        // 从最新数据中查找当前选中的任务，更新其状态
        // 如果找不到（被删除了），清空选中
        setSelectedTask(prev => {
          if (!prev) return null;
          const updated = data.items.find((t: AgentTask) => t.id === prev.id);
          return updated || null; // 找不到就清空，防止 stale 状态
        });
      }
    } finally {
      setLoadingTasks(false);
    }
  }, [selectedAgentId, currentTake, selectedSessionId, setSelectedSessionId]);

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


  const sortedAgents = useMemo(() => {
    let list = [...agents];
    // 根据选中的工作组过滤 Agent
    if (selectedGroupId) {
      list = list.filter(a => a.groupId === selectedGroupId);
    }
    if (agentSearch) {
      list = list.filter(a => a.name.toLowerCase().includes(agentSearch.toLowerCase()));
    }
    return list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [agents, agentSearch, selectedGroupId]);

  const displayedAgents = useMemo(() => {
    if (showAllAgents || agentSearch) return sortedAgents;
    return sortedAgents.slice(0, 6);
  }, [sortedAgents, showAllAgents, agentSearch]);

  const handleTogglePin = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { isPinned } = await agentApi.togglePin(id);
      setAgents(prev => prev.map(a => a.id === id ? { ...a, isPinned } : a));
      message.success(isPinned ? '已置顶' : '已取消置顶');
    } catch (err) {
      message.error('操作失败');
    }
  };

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

  // 从 localStorage 加载各会话的模型记忆
  useEffect(() => {
    try {
      const saved = localStorage.getItem('console_session_models');
      if (saved) setSavedModels(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  // 切换会话时恢复上次使用的模型
  useEffect(() => {
    const sessionId = selectedTask?.claudeSessionId;
    if (!sessionId) return;

    const savedModel = savedModels[sessionId];
    if (savedModel) {
      setSelectedModel(savedModel);
    }
  }, [selectedTask?.claudeSessionId, savedModels]);

  // 保存模型选择到 localStorage
  const saveModelForSession = useCallback((sessionId: string | undefined, model: string | undefined) => {
    if (!sessionId) return;
    setSavedModels(prev => {
      const next = { ...prev, [sessionId]: model || '' };
      try { localStorage.setItem('console_session_models', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleModelChange = useCallback((value: string) => {
    setSelectedModel(value);
    saveModelForSession(selectedTask?.claudeSessionId, value);
  }, [selectedTask?.claudeSessionId, saveModelForSession]);

  // 仅当 Agent ID 真正切换时才重置模型和工作目录
  // 防止 setAgents 更新 lastUsedAt 导致 selectedAgent 引用变化而意外重置
  useEffect(() => {
    if (selectedAgent && selectedAgentId !== prevAgentIdRef.current) {
      prevAgentIdRef.current = selectedAgentId;
      const models = selectedAgent.allowedModels?.split(',').map(m => m.trim()).filter(m => m !== '') || [];
      setSelectedModel(models.length > 0 ? models[0] : '');
      setSelectedWorkingDirectory(selectedAgent.workingDirectory);
    }
  }, [selectedAgentId, selectedAgent]);

  const handleLaunch = async () => {
    if (!selectedAgentId || !prompt.trim()) {
      message.warning('请选择 Agent 并输入任务指令');
      return;
    }

    // 如果没有手动选 continueSession，但当前选中的任务有 SessionId，则优先使用关联 Session
    const activeSessionId = continueSession || (selectedTask?.claudeSessionId ?? null);

    // 合并 prompt 与图片 URL（后端通过 prompt 中的 "图片: url" 识别图片）
    const imagesSuffix = pastedImages.map(img => `\n图片: ${img.url}`).join('');
    const fullPrompt = prompt.trim() + imagesSuffix;

    setLaunching(true);
    try {
      const task = await taskApi.create({
        agentId: selectedAgentId || undefined,
        prompt: fullPrompt,
        resumeSessionId: activeSessionId || undefined,
        forceNewSession: !activeSessionId, // 关键：如果没有指定 Session，强制新开
        model: selectedModel,
        workingDirectory: selectedWorkingDirectory || undefined,
        autoIdentifyAgent,
        optimizePrompt,
        planMode
      });


      message.success('任务已启动' + (activeSessionId ? ' (续写上下文)' : ''));
      setPrompt('');
      setPastedImages([]);
      // 启动后立即清除用于显示”续写中”的标记，因为任务已经接管了 Session
      setContinueSession(null);

      // 更新最后使用时间以影响排序
      setAgents(prev => prev.map(a => a.id === selectedAgentId ? { ...a, lastUsedAt: new Date().toISOString() } : a));

      // 这里的逻辑：启动后我们把这个新任务设为选中任务，后续的 conversationTasks 过滤就会带上它
      setSelectedTask(task);
      // 保存模型到会话记忆（新会话）
      if (task.claudeSessionId) saveModelForSession(task.claudeSessionId, selectedModel);
      setSessionTaskLimit(5); // 重置会话限制
      await loadTasks();
      // 通知看板等其他页面刷新
      bumpDataSync();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? '启动任务失败');
    } finally {
      setLaunching(false);
    }
  };

  const loadMoreSessionTasks = () => {
    setSessionTaskLimit(prev => prev + 5);
    // 如果当前可见的 sessionTasks 已经超过了已拉取的 tasks 数量，则触发全局拉取更多
    const currentSessionInFullList = tasks.filter(t => t.claudeSessionId === selectedTask?.claudeSessionId).length;
    if (sessionTaskLimit >= currentSessionInFullList && selectedAgentId) {
      const newTake = currentTake + 10;
      setCurrentTake(newTake);
      loadTasks(newTake);
    }
  };


  const handleCancel = async (taskId: string) => {
    await taskApi.cancel(taskId);
    if (queuedMessages.length > 0) {
      clearQueuedMessages();
      message.info('排队消息已取消');
    } else {
      message.success('已发送取消指令');
    }
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
      // Bug1: 通知看板刷新
      bumpDataSync();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? '删除会话失败');
    }
  };

  // 打开终端
  const handleOpenTerminal = async () => {
    if (!selectedWorkingDirectory) return;
    setOpeningTerminal(true);
    try {
      await terminalApi.open(selectedWorkingDirectory);
    } catch (e: any) {
      message.error(e?.message || '打开终端失败');
    } finally {
      setOpeningTerminal(false);
    }
  };

  // 打开文件夹
  const handleOpenFolder = async () => {
    if (!selectedWorkingDirectory) return;
    try {
      await terminalApi.openFolder(selectedWorkingDirectory);
    } catch (e: any) {
      message.error(e?.message || '打开文件夹失败');
    }
  };

  // 记录从目录树拖拽的文件/目录路径
  const handleFileTreeDragStart = useCallback((filePath: string) => {
    draggedFilePathRef.current = filePath;
  }, []);

  // 双击文件/目录时，将路径插入输入框
  const handleFileTreeFileClick = useCallback((filePath: string) => {
    const workDir = selectedWorkingDirectory || selectedAgent?.workingDirectory || '';
    // 计算相对路径
    let relativePath = filePath;
    if (workDir && filePath.startsWith(workDir)) {
      relativePath = filePath.slice(workDir.length).replace(/^[\\/]/, '');
    }
    const pathRef = `@${relativePath}`;
    setPrompt(prev => (prev ? `${prev} ${pathRef}` : pathRef));
    message.success(`已添加引用：${relativePath}`);
  }, [selectedWorkingDirectory, selectedAgent?.workingDirectory]);

  // 使用原生事件监听器处理拖拽（比 React synthetic event 更可靠）
  useEffect(() => {
    const wrapper = inputWrapperRef.current;
    if (!wrapper) return;

    const isInWrapper = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof Node)) return false;
      return wrapper.contains(target);
    };

    const handleDragOver = (e: DragEvent) => {
      // 只处理在 wrapper 内部的事件
      if (!isInWrapper(e.target)) return;
      e.preventDefault();
      setDragOverInput(true);
    };

    const handleDrop = (e: DragEvent) => {
      if (!isInWrapper(e.target)) return;
      e.preventDefault();
      setDragOverInput(false);

      // 优先使用 ref 中记录的路径（来自目录树的 onDragStart），其次尝试 dataTransfer
      const filePath = draggedFilePathRef.current || e.dataTransfer?.getData('text/plain');
      if (filePath) {
        const workDir = selectedWorkingDirectory || selectedAgent?.workingDirectory || '';
        // 计算相对路径
        let relativePath = filePath;
        if (workDir && filePath.startsWith(workDir)) {
          relativePath = filePath.slice(workDir.length).replace(/^[\\/]/, '');
        }
        const pathRef = `@${relativePath}`;
        setPrompt(prev => (prev ? `${prev} ${pathRef}` : pathRef));
        message.success(`已添加引用: ${relativePath}`);
      }
      // 清除 ref
      draggedFilePathRef.current = null;
    };

    // 离开页面可视区域时清除高亮
    const handleDragEnd = () => {
      setDragOverInput(false);
      draggedFilePathRef.current = null;
    };

    // 使用捕获阶段，在 document 层级拦截，确保不被子组件阻止
    document.addEventListener('dragover', handleDragOver, true);
    document.addEventListener('drop', handleDrop, true);
    document.addEventListener('dragend', handleDragEnd, true);
    document.addEventListener('dragleave', handleDragEnd, true);

    return () => {
      document.removeEventListener('dragover', handleDragOver, true);
      document.removeEventListener('drop', handleDrop, true);
      document.removeEventListener('dragend', handleDragEnd, true);
      document.removeEventListener('dragleave', handleDragEnd, true);
    };
  }, []);


  const handleStatusChange = useCallback((taskId: string, status: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: status as AgentTask['status'] } : t
    ));
    setSelectedTask(prev =>
      prev?.id === taskId ? { ...prev, status: status as AgentTask['status'] } : prev
    );
  }, []);

  // Bug3 + Bug4: 当当前任务完成/失败时，自动发送所有排队消息（合并为一条）
  const prevAutoTaskId = useRef<string | null>(null);
  useEffect(() => {
    if (queuedMessages.length === 0) return;
    const st = selectedTask?.status;
    if (st !== 'Completed' && st !== 'Failed') return;
    // 防止重复触发
    if (selectedTask?.id === prevAutoTaskId.current) return;
    prevAutoTaskId.current = selectedTask?.id || null;

    const msgs = [...queuedMessages];
    clearQueuedMessages();

    // 确保当前会话有 sessionId 可以续写
    const sessionId = selectedTask?.claudeSessionId;
    if (!sessionId) {
      message.warning('排队消息已清空，无法续写（无有效 SessionId）');
      // 恢复所有消息到输入框
      setPrompt(msgs.map(m => m.prompt).join('\n---\n'));
      return;
    }

    // 合并所有排队消息为一个 prompt
    const combinedPrompt = msgs.map(m => m.prompt).join('\n---\n');
    message.info(`已自动发送 ${msgs.length} 条排队消息`);

    setLaunching(true);
    taskApi.create({
      agentId: msgs[0].agentId || selectedTask.agentId,
      prompt: combinedPrompt,
      resumeSessionId: sessionId,
      forceNewSession: false,
      model: msgs[0].model || selectedModel,
      workingDirectory: msgs[0].workingDirectory || selectedWorkingDirectory,
      autoIdentifyAgent,
      optimizePrompt,
      planMode
    }).then(task => {
      setPrompt('');
      setSelectedTask(task);
      setAgents(pa => pa.map(a => a.id === (msgs[0].agentId || selectedTask.agentId) ? { ...a, lastUsedAt: new Date().toISOString() } : a));
      loadTasks();
    }).catch((e: any) => {
      message.error(e?.response?.data?.error ?? '排队任务启动失败');
      setPrompt(combinedPrompt);
    }).finally(() => {
      setLaunching(false);
    });
  }, [selectedTask, selectedTask?.status, queuedMessages]);

  // Bug4: 组件挂载时检查全局排队消息，如果匹配当前任务，恢复排队状态监听
  useEffect(() => {
    if (queuedMessages.length === 0) return;
    // 排队消息的 sessionId 与当前选中任务的 sessionId 匹配时，说明这是当前会话的排队消息
    if (selectedTask?.claudeSessionId && queuedMessages.some(m => m.sessionId === selectedTask.claudeSessionId)) {
      // 如果当前任务已完成/失败，上面那个 useEffect 会自动触发发送
    }
  }, [queuedMessages, selectedTask]);

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
            <div className="agent-selector-header">
              <Text strong style={{ color: '#8B949E', fontSize: 12 }}>我的 Agent</Text>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <Select
                  size="small"
                  value={selectedGroupId || undefined}
                  onChange={(val) => {
                    setSelectedGroupId(val || null);
                    // 切换工作组时，如果当前选中的 Agent 不在新组内，清空选中
                    setSelectedAgentId(null);
                  }}
                  style={{ width: 90, fontSize: 11 }}
                  className="dark-select"
                  placeholder="全部"
                  allowClear
                  options={[
                    ...groups.map(g => ({
                      label: (
                        <span>
                          {g.color && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: g.color, marginRight: 4 }} />}
                          {g.name}
                        </span>
                      ),
                      value: g.id
                    }))
                  ]}
                />
                <Input
                  size="small"
                  placeholder="搜索..."
                  prefix={<SearchOutlined style={{ fontSize: 10 }} />}
                  value={agentSearch}
                  onChange={e => setAgentSearch(e.target.value)}
                  style={{ width: 70, fontSize: 11, background: '#0D1117', border: 'none' }}
                />
              </div>
            </div>
            <div className="agent-quick-list">
              {displayedAgents.map(a => (
                <div
                  key={a.id}
                  className={`agent-quick-item ${selectedAgentId === a.id ? 'active' : ''}`}
                  onClick={() => setSelectedAgentId(a.id)}
                >
                  <Space size={6} style={{ overflow: 'hidden' }}>
                    <RobotOutlined style={{ color: selectedAgentId === a.id ? '#58A6FF' : '#8B949E', fontSize: 14 }} />
                    <span className="agent-name-text">{a.name}</span>
                  </Space>
                  <div className={`agent-pin-icon ${a.isPinned ? 'pinned' : ''}`} onClick={(e) => handleTogglePin(a.id, e)}>
                    {a.isPinned ? <PushpinFilled /> : <PushpinOutlined />}
                  </div>
                </div>
              ))}
              {sortedAgents.length > 6 && !agentSearch && (
                <div className="agent-list-more" onClick={() => setShowAllAgents(!showAllAgents)}>
                  {showAllAgents ? <><UpOutlined /> 收起</> : <><DownOutlined /> 更多 Agent ({sortedAgents.length - 6})</>}
                </div>
              )}
            </div>
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
          <div className="task-list">
            {siderTasks.map(task => (
              <div
                key={task.id}
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
                    <div className="task-item-actions">
                      {task.status === 'Running' && (
                        <Button
                          className="cancel-btn"
                          type="text" size="small" danger icon={<StopOutlined />}
                          onClick={(e) => { e.stopPropagation(); handleCancel(task.id); }}
                          title="停止任务"
                        />
                      )}
                      {task.status !== 'Running' && task.claudeSessionId && (
                        <Button
                          className="reload-btn"
                          type="text" size="small" icon={<ReloadOutlined style={{ color: '#58A6FF' }} />}
                          onClick={(e) => { e.stopPropagation(); setContinueSession(task.claudeSessionId || null); }}
                          title="在该会话续写"
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
                          className="delete-session-btn"
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                          title="删除会话"
                        />
                      </Popconfirm>
                    </div>
                  </div>
                  <div className="task-prompt-preview">
                    {task.claudeSessionId ? `最新: ${task.prompt}` : task.prompt}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                    {task.isPlanMode && (
                      <div className="plan-mode-badge">
                        📋 Plan 模式 — 仅分析规划，不执行修改
                      </div>
                    )}
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


          <div
            ref={inputWrapperRef}
            className={`chat-input-wrapper${dragOverInput ? ' drag-over' : ''}`}
          >
            <div className="chat-input-options">
              <div className="options-left">
                {selectedAgent ? (
                  <Space size={8}>
                    <div className="option-item">
                      <Text className="option-label">执行模型:</Text>
                      <Select
                        size="small"
                        value={selectedModel}
                        onChange={handleModelChange}
                        style={{ width: 140 }}
                        className="dark-select"
                        options={[
                          ...(selectedAgent.allowedModels?.split(',').map(m => m.trim()).filter(m => m !== '') || []).map(m => ({ label: m, value: m })),
                          { label: '系统默认 (本地配置)', value: '' }
                        ]}
                      />
                    </div>
                    <div className="option-item">
                      <Text className="option-label">工作目录:</Text>
                      <AutoComplete
                        size="small"
                        value={selectedWorkingDirectory}
                        onChange={setSelectedWorkingDirectory}
                        style={{ width: 180 }}
                        className="dark-autocomplete"
                        placeholder="工作目录"
                        options={[
                          ...(selectedAgent.workingDirectory ? [{ label: `默认: ${selectedAgent.workingDirectory}`, value: selectedAgent.workingDirectory }] : []),
                          ...commonPaths.map(p => ({ label: `${p.name} (${p.path})`, value: p.path }))
                        ]}
                      />
                      <Tooltip title="打开终端">
                        <Button
                          size="small"
                          type="text"
                          icon={<DesktopOutlined />}
                          onClick={handleOpenTerminal}
                          disabled={!selectedWorkingDirectory}
                          loading={openingTerminal}
                          className="terminal-btn"
                        />
                      </Tooltip>
                      <Tooltip title="打开工作目录">
                        <Button
                          size="small"
                          type="text"
                          icon={<FolderOutlined />}
                          onClick={handleOpenFolder}
                          disabled={!selectedWorkingDirectory}
                          className="open-folder-btn"
                        />
                      </Tooltip>
                      <Tooltip title="查看 Git 变更">
                        <Button
                          size="small"
                          type="text"
                          icon={<BranchesOutlined />}
                          onClick={() => setGitDrawerVisible(true)}
                          disabled={!selectedWorkingDirectory}
                          className="git-btn"
                        />
                      </Tooltip>
                      <Tooltip title="查看目录结构">
                        <Button
                          size="small"
                          type="text"
                          icon={<FolderOutlined />}
                          onClick={() => setFileTreeDrawerVisible(true)}
                          disabled={!selectedWorkingDirectory}
                          className="file-tree-btn"
                        />
                      </Tooltip>
                    </div>
                    <div className="toggle-item">
                      <Tooltip title="使用 AI 优化指令以获得更精准的执行结果">
                        <span className="toggle-label">优化 Prompt</span>
                      </Tooltip>
                      <Switch
                        size="small"
                        checked={optimizePrompt}
                        onChange={setOptimizePrompt}
                        className="premium-switch optimize-switch"
                        checkedChildren="开"
                        unCheckedChildren="关"
                      />
                    </div>
                    <div className="toggle-item">
                      <Tooltip title="仅进行分析与规划，不执行代码修改操作">
                        <span className="toggle-label">Plan 模式</span>
                      </Tooltip>
                      <Switch
                        size="small"
                        checked={planMode}
                        onChange={setPlanMode}
                        className="premium-switch plan-switch"
                        checkedChildren="开"
                        unCheckedChildren="关"
                      />
                    </div>
                  </Space>
                ) : (
                  <Space size={8} style={{ color: '#8B949E', fontSize: 12 }}>
                    <RobotOutlined />
                    <span>请从侧边栏选择 Agent</span>
                  </Space>
                )}
              </div>

              {!selectedWorkingDirectory && (!selectedAgent || !selectedAgent.workingDirectory) && (
                <div className="warning-text">* 必须指定目录才能启动</div>
              )}
            </div>
            <div className="chat-input-bar">
              {continueSession && (
                <div className="continue-hint-badge">
                  续写会话: {continueSession.substring(0, 8)}
                  <Button type="link" size="small" onClick={() => setContinueSession(null)}>取消</Button>
                </div>
              )}
              {queuedMessages.length > 0 && (
                <div className="continue-hint-badge" style={{ background: '#1a2733', borderColor: '#58A6FF', flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#58A6FF' }}>排队中 ({queuedMessages.length} 条)</span>
                    <Button type="link" size="small" onClick={() => clearQueuedMessages()}>全部取消</Button>
                  </div>
                  {queuedMessages.map((m, i) => (
                    <div key={i} className="queued-item-row">
                      <span className="queued-item-text">{i + 1}. {m.prompt.substring(0, 50)}{m.prompt.length > 50 ? '...' : ''}</span>
                      <button
                        className="queued-item-remove"
                        onClick={() => setQueuedMessages(queuedMessages.filter((_, j) => j !== i))}
                        title="移除此条"
                      >×</button>
                    </div>
                  ))}
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
                    // Bug3+Bug4: 任务运行中，Ctrl+Enter 进入排队（支持多条积累）
                    if (selectedTask?.status === 'Running') {
                      if (!prompt.trim()) return;
                      const imagesSuffix = pastedImages.map(img => `\n图片: ${img.url}`).join('');
                      addQueuedMessage({
                        prompt: prompt.trim() + imagesSuffix,
                        agentId: selectedAgentId || '',
                        sessionId: selectedTask.claudeSessionId || '',
                        model: selectedModel,
                        workingDirectory: selectedWorkingDirectory,
                        planMode: optimizePrompt
                      });
                      message.success(`消息已加入排队（共 ${queuedMessages.length + 1} 条），将在当前任务完成后自动发送`);
                      setPrompt('');
                      setPastedImages([]);
                      return;
                    }
                    handleLaunch();
                  }
                }}
                onPaste={async (e) => {
                  const items = e.clipboardData.items;
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      const file = items[i].getAsFile();
                      if (file) {
                        message.loading({ content: '正在上传粘贴的图片...', key: 'paste-upload' });
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
                            const imgId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                            setPastedImages(prev => [...prev, { id: imgId, url: data.url }]);
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
              {pastedImages.length > 0 && (
                <div className="pasted-images-row">
                  {pastedImages.map(img => (
                    <div key={img.id} className="pasted-image-thumb">
                      <img src={img.url} alt="粘贴的图片" />
                      <button
                        className="pasted-image-remove"
                        onClick={() => setPastedImages(prev => prev.filter(p => p.id !== img.id))}
                        title="移除图片"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                      const url = info.file.response.url;
                      const imgId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                      setPastedImages(prev => [...prev, { id: imgId, url }]);
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
                  <>
                    {queuedMessages.length > 0 ? (
                      <Button
                        className="send-button"
                        type="primary"
                        ghost
                        icon={<SendOutlined />}
                        onClick={() => {
                          // 用户主动点击，立即清空排队
                          clearQueuedMessages();
                          message.info('排队已取消');
                        }}
                      >
                        排队中 ({queuedMessages.length}条) · 点击取消
                      </Button>
                    ) : (
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
                    )}
                  </>
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

      <GitDrawer
        visible={gitDrawerVisible}
        onClose={() => setGitDrawerVisible(false)}
        workingDirectory={selectedWorkingDirectory || selectedAgent?.workingDirectory}
      />
      <FileTreeDrawer
        visible={fileTreeDrawerVisible}
        onClose={() => setFileTreeDrawerVisible(false)}
        workingDirectory={selectedWorkingDirectory || selectedAgent?.workingDirectory}
        onFileClick={handleFileTreeFileClick}
        onDragStart={handleFileTreeDragStart}
      />
    </div>
  );
};

export default ConsolePage;

