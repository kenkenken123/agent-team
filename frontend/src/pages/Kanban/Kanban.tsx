import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Select, Button, Modal, Input,
  message, Popover, Popconfirm, Spin, Tooltip
} from 'antd';
import {
  LayoutDashboard,
  Plus,
  RefreshCw,
  Bot,
  Clock,
  MessageSquare,
  Eye,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  XCircle,
  PlayCircle,
  Bell
} from 'lucide-react';
import { DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

import { agentApi } from '../../api/agentApi';
import { taskApi } from '../../api/taskApi';
import { useAppStore } from '../../stores/appStore';
import type { Agent, AgentTask, TaskStatus } from '../../types';
import './Kanban.css';

dayjs.extend(relativeTime);
dayjs.extend(utc);

/** 解析后端返回的时间字符串为本地时间（后端存的是 UTC，但不带 Z 标记） */
const parseTime = (value: string): dayjs.Dayjs => {
  // 如果已经有 Z 或其他时区标记，直接解析
  if (value.endsWith('Z') || value.includes('+')) {
    return dayjs(value);
  }
  // 否则当作 UTC 时间解析
  return dayjs.utc(value).local();
};

// 模拟”占位会话”类型
interface KanbanSession {
  sessionId: string;
  agentId: string;
  agentName: string;
  latestTask?: AgentTask;
  status: TaskStatus | 'Idle';
  updatedAt: string;
  lastOutput?: string;
  isPlaceholder?: boolean;
}

const KanbanPage: React.FC = () => {
  const { setPage, setSelectedAgentId, setSelectedSessionId, dataSyncVersion, bumpDataSync } = useAppStore();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterAgentIds, setFilterAgentIds] = useState<string[]>([]);

  // 弹框状态
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [launchPrompt, setLaunchPrompt] = useState('');
  const [selectedSession, setSelectedSession] = useState<KanbanSession | null>(null);
  const [newAgentId, setNewAgentId] = useState<string | undefined>(undefined);
  const [newPrompt, setNewPrompt] = useState('');
  const [processing, setProcessing] = useState(false);

  // "继续聊天"弹框中展示的上次任务完整输出
  const [lastOutputContent, setLastOutputContent] = useState<string | null>(null);
  const [outputLoading, setOutputLoading] = useState(false);

  // 内存中维护的占位会话
  const [placeholders, setPlaceholders] = useState<KanbanSession[]>([]);

  // 任务输出缓存：taskId -> 最后一行有意义的输出
  const [outputCache, setOutputCache] = useState<Record<string, string>>({});

  // 已查看的会话 ID 集合（localStorage 持久化）
  const [viewedSessionIds, setViewedSessionIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('kanban_viewed_sessions');
      return stored ? new Set(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  // 标记会话为已查看
  const markAsViewed = (sessionId: string) => {
    setViewedSessionIds(prev => {
      const next = new Set(prev);
      next.add(sessionId);
      localStorage.setItem('kanban_viewed_sessions', JSON.stringify([...next]));
      return next;
    });
  };

  // 加载基础数据
  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [agentsData, tasksData] = await Promise.all([
        agentApi.getAll(),
        taskApi.getAll({ take: 100 })
      ]);
      setAgents(agentsData.filter(a => a.isEnabled));
      setTasks(tasksData.items);
    } catch (err) {
      console.error(err);
      if (!quiet) message.error('加载看板数据失败');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = setInterval(() => loadData(true), 5000); // 5秒轮询
    return () => clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (dataSyncVersion > 0) {
      loadData(true);
    }
  }, [dataSyncVersion, loadData]);

  // 获取任务的最后触发时间：优先使用 startedAt，回退到 createdAt
  const getTaskTriggerTime = (task: AgentTask): string => {
    return task.startedAt || task.createdAt;
  };

  // 将任务聚合为会话
  const sessions = useMemo(() => {
    const sessionMap = new Map<string, KanbanSession>();

    tasks.forEach(task => {
      const sid = task.claudeSessionId || `single-${task.id}`;
      const existing = sessionMap.get(sid);
      const triggerTime = getTaskTriggerTime(task);

      if (!existing || parseTime(triggerTime).isAfter(parseTime(existing.updatedAt))) {
        sessionMap.set(sid, {
          sessionId: sid,
          agentId: task.agentId,
          agentName: task.agentName || 'Unknown Agent',
          latestTask: task,
          status: task.status,
          updatedAt: triggerTime,
          lastOutput: '',
          isPlaceholder: false
        });
      }
    });

    const allSessions = Array.from(sessionMap.values());
    const filteredPlaceholders = placeholders.filter(p => {
      return !allSessions.some(s => s.agentId === p.agentId && !s.isPlaceholder);
    });

    return [...allSessions, ...filteredPlaceholders];
  }, [tasks, placeholders]);

  const filteredSessions = useMemo(() => {
    let list = sessions;
    if (filterAgentIds.length > 0) {
      list = list.filter(s => filterAgentIds.includes(s.agentId));
    }
    return list.sort((a, b) => parseTime(b.updatedAt).unix() - parseTime(a.updatedAt).unix());
  }, [sessions, filterAgentIds]);

  // 加载任务输出缓存
  useEffect(() => {
    const sessionsToLoad = filteredSessions.filter(s => {
      if (!s.latestTask?.id || s.isPlaceholder) return false;
      if (s.status === 'Running') return true;
      return !outputCache[s.latestTask.id];
    }).slice(0, 30);

    if (sessionsToLoad.length === 0) return;

    let cancelled = false;
    sessionsToLoad.forEach(async session => {
      const taskId = session.latestTask!.id;
      try {
        const raw = await taskApi.getOutput(taskId);
        if (cancelled) return;
        const rawContent = raw ?? '';
        const noAnsi = rawContent.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        const allLines = noAnsi.split(/\r?\n/);
        const processedLines = allLines
          .map(line => line.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').trim())
          .filter(line => line.length >= 2);
        
        const lastLine = processedLines[processedLines.length - 1] ?? '';
        setOutputCache(prev => ({ ...prev, [taskId]: lastLine }));
      } catch {
        // 忽略错误
      }
    });

    return () => { cancelled = true; };
  }, [filteredSessions]);

  const columns = {
    idle: filteredSessions.filter(s =>
      s.isPlaceholder || (
        (s.status === 'Completed' || s.status === 'Failed' || s.status === 'Cancelled') &&
        viewedSessionIds.has(s.sessionId)
      )
    ),
    running: filteredSessions.filter(s => s.status === 'Running'),
    completed: filteredSessions.filter(s =>
      (s.status === 'Completed' || s.status === 'Failed' || s.status === 'Cancelled') &&
      !s.isPlaceholder && !viewedSessionIds.has(s.sessionId)
    )
  };

  const handleLaunch = async () => {
    if (!selectedSession || !launchPrompt.trim()) return;
    setProcessing(true);
    try {
      const isRealSession = selectedSession.sessionId && !selectedSession.sessionId.startsWith('single-');
      await taskApi.create({
        agentId: selectedSession.agentId,
        prompt: launchPrompt.trim(),
        resumeSessionId: isRealSession ? selectedSession.sessionId : undefined,
        forceNewSession: !isRealSession
      });
      message.success('任务已启动');
      setIsLaunchModalOpen(false);
      setLaunchPrompt('');
      if (selectedSession.isPlaceholder) {
        setPlaceholders(prev => prev.filter(p => p.agentId !== selectedSession.agentId));
      }
      loadData(true);
      bumpDataSync();
    } catch (e: any) {
      message.error(e?.response?.data?.error || '启动失败');
    } finally {
      setProcessing(false);
    }
  };

  const handleAddNewSession = async () => {
    if (!newAgentId) {
      message.warning('请选择一个 Agent');
      return;
    }

    if (newPrompt.trim()) {
      setProcessing(true);
      try {
        await taskApi.create({
          agentId: newAgentId,
          prompt: newPrompt.trim(),
          forceNewSession: true
        });
        message.success('新会话已启动');
        setIsAddModalOpen(false);
        setNewPrompt('');
        loadData(true);
        bumpDataSync();
      } catch (e: any) {
        message.error(e?.response?.data?.error || '启动失败');
      } finally {
        setProcessing(false);
      }
    } else {
      const agent = agents.find(a => a.id === newAgentId);
      const newPlaceholder: KanbanSession = {
        sessionId: '',
        agentId: newAgentId,
        agentName: agent?.name || 'New Session',
        status: 'Idle',
        updatedAt: new Date().toISOString(),
        isPlaceholder: true
      };
      setPlaceholders(prev => [newPlaceholder, ...prev]);
      message.success('占位会话已创建');
      setIsAddModalOpen(false);
    }
  };

  const goToDetail = (session: KanbanSession) => {
    if (session.sessionId) {
      markAsViewed(session.sessionId);
    }
    setSelectedAgentId(session.agentId);
    setSelectedSessionId(session.sessionId || null);
    setPage('console');
  };

  // 打开"继续聊天"弹框，加载上次任务的完整输出
  const handleOpenLaunch = async (session: KanbanSession) => {
    setSelectedSession(session);
    setLastOutputContent(null);
    setIsLaunchModalOpen(true);

    if (session.latestTask?.id) {
      setOutputLoading(true);
      try {
        const raw = await taskApi.getOutput(session.latestTask.id);
        const cleaned = (raw ?? '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        setLastOutputContent(cleaned);
      } catch {
        setLastOutputContent('获取输出失败');
      } finally {
        setOutputLoading(false);
      }
    }
  };

  const handleDeleteSession = async (session: KanbanSession) => {
    if (!session.latestTask) return;
    try {
      const isRealSession = session.sessionId && !session.sessionId.startsWith('single-');
      await taskApi.deleteSession(
        isRealSession ? session.sessionId : undefined,
        !isRealSession ? session.latestTask.id : undefined
      );
      message.success('会话已彻底删除');
      // 清理已查看记录（仅真实会话ID需要清理）
      if (isRealSession) {
        setViewedSessionIds(prev => {
          const next = new Set(prev);
          next.delete(session.sessionId);
          localStorage.setItem('kanban_viewed_sessions', JSON.stringify([...next]));
          return next;
        });
      }
      loadData(true);
      bumpDataSync();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? '删除会话失败');
    }
  };

  const renderStatusInfo = (status: string) => {
    switch (status) {
      case 'Running':
        return {
          icon: <RefreshCw size={14} className="animate-spin" />,
          label: 'Running',
          dotClass: 'status-dot-running',
          labelClass: 'status-label-running'
        };
      case 'Completed':
        return {
          icon: <CheckCircle2 size={14} />,
          label: 'Completed',
          dotClass: 'status-dot-completed',
          labelClass: 'status-label-completed'
        };
      case 'Failed':
        return {
          icon: <AlertCircle size={14} />,
          label: 'Failed',
          dotClass: 'status-dot-failed',
          labelClass: 'status-label-failed'
        };
      case 'Cancelled':
        return {
          icon: <XCircle size={14} />,
          label: 'Cancelled',
          dotClass: 'status-dot-idle',
          labelClass: 'status-label-idle'
        };
      default:
        return {
          icon: <PlayCircle size={14} />,
          label: 'Idle',
          dotClass: 'status-dot-idle',
          labelClass: 'status-label-idle'
        };
    }
  };

  const renderCard = (session: KanbanSession) => {
    const statusInfo = renderStatusInfo(session.status);

    const popoverContent = (
      <div className="card-hover-actions">
        <button
          className="action-btn"
          onClick={() => handleOpenLaunch(session)}
        >
          <MessageSquare size={16} /> 继续聊天
        </button>
        <button
          className="action-btn"
          onClick={() => goToDetail(session)}
        >
          <Eye size={16} /> 查看详情
        </button>
        <button
          className="action-btn"
          onClick={() => {
            setNewAgentId(session.agentId);
            setIsAddModalOpen(true);
          }}
        >
          <UserPlus size={16} /> 在此 Agent 新增会话
        </button>
        <Popconfirm
          title={session.status === 'Running' ? '会话中仍有任务在运行，确定要强制终止并删除整个会话吗？' : '确定删除此会话及其所有历史记录？'}
          onConfirm={(e) => { e?.stopPropagation(); handleDeleteSession(session); }}
          okText="彻底删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <button className="action-btn action-btn-danger">
            <DeleteOutlined /> 删除会话
          </button>
        </Popconfirm>
      </div>
    );

    return (
      <Popover
        key={session.sessionId || `card-${session.agentId}-${session.updatedAt}`}
        content={popoverContent}
        trigger="hover"
        placement="rightTop"
        overlayClassName="canvas-popover"
      >
        <div className="kanban-card group">
          <div className="card-header">
            <div className="agent-meta">
              <div className={`status-dot ${statusInfo.dotClass}`} />
              <span className="agent-name">{session.agentName}</span>
            </div>
            {session.sessionId && (
              <span className="session-id">#{session.sessionId.substring(0, 8)}</span>
            )}
          </div>

          <div className="card-body">
            {session.latestTask ? (
              <>
                <div className="user-input-section">
                  <span className="input-prefix">用户输入</span>
                  <Tooltip title={session.latestTask.prompt}>
                    <span className="input-text">{session.latestTask.prompt}</span>
                  </Tooltip>
                </div>
                {outputCache[session.latestTask.id] && (
                  <div className="output-preview">
                    {outputCache[session.latestTask.id]}
                  </div>
                )}
              </>
            ) : (
              <div className="output-preview">等待发起指令...</div>
            )}
          </div>

          <div className="card-footer">
            <div className={`status-label ${statusInfo.labelClass}`}>
              {statusInfo.icon}
              <span>{statusInfo.label}</span>
            </div>
            <div className="time-ago">
              <Clock size={12} />
              <span>{parseTime(session.updatedAt).fromNow()}</span>
            </div>
          </div>
        </div>
      </Popover>
    );
  };

  return (
    <div className="kanban-page">
      <div className="kanban-header">
        <div className="header-group">
          <LayoutDashboard className="header-icon" size={24} />
          <h1>会话看板</h1>
        </div>
        <div className="header-actions">
          <Select
            mode="multiple"
            placeholder="筛选 Agent"
            className="header-select"
            value={filterAgentIds}
            onChange={setFilterAgentIds}
            maxTagCount="responsive"
            allowClear
            dropdownStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d' }}
          >
            {agents.map(a => (
              <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>
            ))}
          </Select>
          <Button
            type="primary"
            className="header-btn-new"
            onClick={() => { setNewAgentId(undefined); setIsAddModalOpen(true); }}
          >
            <Plus size={18} /> 新增会话
          </Button>
          <button 
            className="header-btn-refresh"
            onClick={() => loadData()}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="loading-wrapper">
          <Spin size="large" />
        </div>
      ) : (
        <div className="kanban-board">
          {/* 空闲等待（已完成且已查看） */}
          <div className="kanban-column">
            <div className="column-header">
              <div className="column-title title-idle">
                <PlayCircle size={16} />
                <span>空闲等待</span>
              </div>
              <span className="column-count count-idle">{columns.idle.length}</span>
            </div>
            <div className="card-list">
              {columns.idle.map(renderCard)}
              {columns.idle.length === 0 && (
                <div className="empty-placeholder">
                  <MessageSquare />
                  <span>暂无任务</span>
                </div>
              )}
            </div>
          </div>

          {/* 正在执行 */}
          <div className="kanban-column column-running">
            <div className="column-header">
              <div className="column-title title-running">
                <RefreshCw size={16} className="animate-spin" />
                <span>正在执行</span>
              </div>
              <span className="column-count count-running">
                {columns.running.length}
              </span>
            </div>
            <div className="card-list">
              {columns.running.map(renderCard)}
              {columns.running.length === 0 && (
                <div className="empty-placeholder">
                  <Bot />
                  <span>暂无任务</span>
                </div>
              )}
            </div>
          </div>

          {/* 已完成但未查看 */}
          <div className="kanban-column">
            <div className="column-header">
              <div className="column-title title-completed">
                <Bell size={16} />
                <span>待查看</span>
              </div>
              <span className="column-count count-completed">
                {columns.completed.length}
              </span>
            </div>
            <div className="card-list">
              {columns.completed.map(renderCard)}
              {columns.completed.length === 0 && (
                <div className="empty-placeholder">
                  <CheckCircle2 />
                  <span>暂无未查看任务</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 继续聊天弹框 */}
      <Modal
        title={
          <div className="modal-title-wrapper">
            <MessageSquare size={18} className="modal-title-icon" />
            <span>继续会话 - {selectedSession?.agentName}</span>
          </div>
        }
        open={isLaunchModalOpen}
        onOk={handleLaunch}
        onCancel={() => setIsLaunchModalOpen(false)}
        confirmLoading={processing}
        okText="直接启动"
        className="dark-modal"
        width={680}
      >
        <div className="modal-desc">
          <p className="modal-desc-text">
            正在向会话 <span className="modal-desc-id">{selectedSession?.sessionId?.substring(0, 8) || '新起点'}</span> 发送新指令
          </p>
        </div>

        {/* 上次任务返回信息 */}
        {selectedSession?.latestTask && (
          <div className="last-output-section">
            <div className="output-section-header">
              <span className="output-header-label">上次返回结果</span>
              {outputLoading && <span className="output-loading-text">加载中...</span>}
            </div>
            <div className="last-output-content">
              {outputLoading ? (
                <div className="output-skeleton">
                  <div className="skeleton-line skeleton-line-full" />
                  <div className="skeleton-line skeleton-line-full" />
                  <div className="skeleton-line skeleton-line-medium" />
                  <div className="skeleton-line skeleton-line-full" />
                  <div className="skeleton-line skeleton-line-medium" />
                </div>
              ) : lastOutputContent ? (
                <pre className="output-pre">{lastOutputContent}</pre>
              ) : (
                <span className="output-empty">暂无输出内容</span>
              )}
            </div>
          </div>
        )}

        <div className="modal-prompt-input">
          <label className="prompt-label">新指令</label>
          <Input.TextArea
            placeholder="请输入任务内容..."
            autoSize={{ minRows: 3, maxRows: 6 }}
            value={launchPrompt}
            onChange={e => setLaunchPrompt(e.target.value)}
            className="modal-textarea"
          />
        </div>
      </Modal>

      {/* 新增会话弹框 */}
      <Modal
        title={
          <div className="modal-title-wrapper">
            <Plus size={18} className="modal-title-icon" />
            <span>创建新会话</span>
          </div>
        }
        open={isAddModalOpen}
        onOk={handleAddNewSession}
        onCancel={() => setIsAddModalOpen(false)}
        confirmLoading={processing}
        okText="确定"
        className="dark-modal"
      >
        <div className="modal-form">
          <div className="modal-form-item">
            <label>选择 Agent *</label>
            <Select
              style={{ width: '100%' }}
              placeholder="请选择"
              value={newAgentId}
              onChange={setNewAgentId}
              dropdownStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d' }}
            >
              {agents.map(a => (
                <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>
              ))}
            </Select>
          </div>
          <div className="modal-form-item">
            <label>初始任务 (可选)</label>
            <Input.TextArea
              placeholder="输入任务则立即启动，不输入则仅创建占位符"
              autoSize={{ minRows: 4, maxRows: 8 }}
              value={newPrompt}
              onChange={e => setNewPrompt(e.target.value)}
              className="modal-textarea"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default KanbanPage;

