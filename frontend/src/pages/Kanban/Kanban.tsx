import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Typography, Space, Select, Button, Modal, Input,
  message, Popover, Badge, Empty, Spin, Tag, Tooltip
} from 'antd';
import {
  AppstoreOutlined, PlusOutlined, RobotOutlined,
  ReloadOutlined, SearchOutlined, MessageOutlined,
  EyeOutlined, UserAddOutlined, ClockCircleOutlined,
  PlayCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { agentApi } from '../../api/agentApi';
import { taskApi } from '../../api/taskApi';
import { useAppStore } from '../../stores/appStore';
import type { Agent, AgentTask, TaskStatus } from '../../types';
import './Kanban.css';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;

// 模拟“占位会话”类型
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

  // 内存中维护的占位会话
  const [placeholders, setPlaceholders] = useState<KanbanSession[]>([]);

  // 任务输出缓存：taskId -> 最后一行有意义的输出
  const [outputCache, setOutputCache] = useState<Record<string, string>>({});

  // 加载基础数据
  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [agentsData, tasksData] = await Promise.all([
        agentApi.getAll(),
        taskApi.getAll({ take: 100 }) // 看板需要较多样数据来展示
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

  // Bug1: 监听其他页面的数据变更通知，即时刷新
  useEffect(() => {
    if (dataSyncVersion > 0) {
      loadData(true);
    }
  }, [dataSyncVersion, loadData]);

  // 将任务聚合为会话
  const sessions = useMemo(() => {
    const sessionMap = new Map<string, KanbanSession>();

    // 处理真实任务数据
    tasks.forEach(task => {
      const sid = task.claudeSessionId || `single-${task.id}`;
      const existing = sessionMap.get(sid);

      if (!existing || dayjs(task.createdAt).isAfter(dayjs(existing.updatedAt))) {
        sessionMap.set(sid, {
          sessionId: task.claudeSessionId || '',
          agentId: task.agentId,
          agentName: task.agentName || 'Unknown Agent',
          latestTask: task,
          status: task.status,
          updatedAt: task.createdAt,
          lastOutput: '', // 这里后端目前没返回最后一行内容，前端可能需要截断 Prompt 或等待扩展
          isPlaceholder: false
        });
      }
    });

    const allSessions = Array.from(sessionMap.values());

    // 合并占位会话 (如果没有真实任务覆盖它)
    const filteredPlaceholders = placeholders.filter(p => {
      // 如果这个 agent 有了真实会话（通常是刚启动后），我们就移除占位
      // 这里的逻辑比较简单：同一个 agent 的占位如果已有真实会话产生则移除
      return !allSessions.some(s => s.agentId === p.agentId && !s.isPlaceholder);
    });

    return [...allSessions, ...filteredPlaceholders];
  }, [tasks, placeholders]);

  // 筛选后的会话
  const filteredSessions = useMemo(() => {
    let list = sessions;
    if (filterAgentIds.length > 0) {
      list = list.filter(s => filterAgentIds.includes(s.agentId));
    }
    return list.sort((a, b) => dayjs(b.updatedAt).unix() - dayjs(a.updatedAt).unix());
  }, [sessions, filterAgentIds]);

  // 加载可见会话的最新输出（Running 每次刷新；已完成命中缓存则跳过）
  useEffect(() => {
    const sessionsToLoad = filteredSessions.filter(s => {
      if (!s.latestTask?.id || s.isPlaceholder) return false;
      if (s.status === 'Running') return true;          // 运行中每次更新
      return !outputCache[s.latestTask.id];             // 其他状态只拉一次
    }).slice(0, 30); // 最多并发 30 个

    if (sessionsToLoad.length === 0) return;

    let cancelled = false;
    sessionsToLoad.forEach(async session => {
      const taskId = session.latestTask!.id;
      try {
        const raw = await taskApi.getOutput(taskId);
        if (cancelled) return;
        // 去除 ANSI 转义码 & 控制字符
        const rawContent = raw ?? '';
        // 1. 去除 ANSI 转义码
        const noAnsi = rawContent.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        // 2. 按行分割
        const allLines = noAnsi.split(/\r?\n/);
        // 3. 取最后几行中非空且有意义的一行进行清洗显示
        const processedLines = allLines
          .map(line => line.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').trim())
          .filter(line => line.length >= 2);
        
        const lastLine = processedLines[processedLines.length - 1] ?? '';
        setOutputCache(prev => ({ ...prev, [taskId]: lastLine }));
      } catch {
        // 忽略错误，保留旧缓存
      }
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSessions]);

  // 分类到三列
  const columns = {
    // 空闲等待：等待发起任务的会话（Pending）或纯占位符（Idle）
    idle: filteredSessions.filter(s => s.status === 'Pending' || s.status === 'Idle'),
    // 正在执行：有任务正在运行
    running: filteredSessions.filter(s => s.status === 'Running'),
    // 已完成：包含成功、失败、取消
    completed: filteredSessions.filter(s => s.status === 'Completed' || s.status === 'Failed' || s.status === 'Cancelled')
  };

  // 操作函数
  const handleLaunch = async () => {
    if (!selectedSession || !launchPrompt.trim()) return;
    setProcessing(true);
    try {
      await taskApi.create({
        agentId: selectedSession.agentId,
        prompt: launchPrompt.trim(),
        resumeSessionId: selectedSession.sessionId || undefined,
        forceNewSession: !selectedSession.sessionId
      });
      message.success('任务已启动');
      setIsLaunchModalOpen(false);
      setLaunchPrompt('');
      // 如果启动的是占位，移除它
      if (selectedSession.isPlaceholder) {
        setPlaceholders(prev => prev.filter(p => p.agentId !== selectedSession.agentId));
      }
      loadData(true);
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
      // 如果填了任务，直接启动
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
      } catch (e: any) {
        message.error(e?.response?.data?.error || '启动失败');
      } finally {
        setProcessing(false);
      }
    } else {
      // 如果没填任务，创建占位
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
    setSelectedAgentId(session.agentId);
    setSelectedSessionId(session.sessionId || null);
    setPage('console');
    // 注意：这里跳转到 console 还需要某种机制让它选中特定的 sessionId
    // 目前 console 加载逻辑是基于选中的 agentId 加载最新任务
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'Running': return <SyncOutlined spin style={{ color: '#58a6ff' }} />;
      case 'Completed': return <CheckCircleOutlined style={{ color: '#3fb950' }} />;
      case 'Failed': return <ExclamationCircleOutlined style={{ color: '#f85149' }} />;
      case 'Cancelled': return <CloseCircleOutlined style={{ color: '#8b949e' }} />;
      default: return <ClockCircleOutlined style={{ color: '#8b949e' }} />;
    }
  };

  const renderCard = (session: KanbanSession) => {
    const popoverContent = (
      <div className="card-hover-actions">
        <Button
          type="text"
          icon={<MessageOutlined />}
          onClick={() => { setSelectedSession(session); setIsLaunchModalOpen(true); }}
        >
          继续聊天
        </Button>
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => goToDetail(session)}
        >
          查看详情
        </Button>
        <Button
          type="text"
          icon={<UserAddOutlined />}
          onClick={() => {
            setNewAgentId(session.agentId);
            setIsAddModalOpen(true);
          }}
        >
          在此 Agent 新增会话
        </Button>
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
        <div className={`kanban-card status-${session.status.toLowerCase()}`}>
          <div className="card-header">
            <div className="agent-info">
              <RobotOutlined style={{ color: '#8b949e' }} />
              <span className="agent-name">{session.agentName}</span>
            </div>
            {session.sessionId && <span className="session-id">#{session.sessionId.substring(0, 8)}</span>}
          </div>

          <div className="card-content">
            <div className="latest-output">
              {session.latestTask
                ? (outputCache[session.latestTask.id] || session.latestTask.prompt)
                : '等待发起指令...'}
            </div>
          </div>

          <div className="card-footer">
            <Space size={4}>
              {statusIcon(session.status)}
              <span>{session.status}</span>
            </Space>
            <div className="time-stamp">
              <ClockCircleOutlined />
              <span>{dayjs(session.updatedAt).fromNow()}</span>
            </div>
          </div>
        </div>
      </Popover>
    );
  };

  return (
    <div className="kanban-page">
      <div className="kanban-header">
        <Title level={4} style={{ margin: 0, color: '#f0f6fc' }}>
          <AppstoreOutlined /> 会话看板
        </Title>
        <Space>
          <Select
            mode="multiple"
            placeholder="筛选 Agent"
            style={{ width: 300 }}
            value={filterAgentIds}
            onChange={setFilterAgentIds}
            maxTagCount="responsive"
            allowClear
          >
            {agents.map(a => (
              <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>
            ))}
          </Select>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setNewAgentId(undefined); setIsAddModalOpen(true); }}
          >
            新增会话
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadData()}>刷新</Button>
        </Space>
      </div>

      {loading && tasks.length === 0 ? (
        <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" />
        </div>
      ) : (
        <div className="kanban-board">
          <div className="kanban-column">
            <div className="column-header">
              <h3>空闲等待 <Badge count={columns.idle.length} offset={[10, -5]} style={{ transform: 'scale(0.8)' }} /></h3>
            </div>
            <div className="card-list">
              {columns.idle.map(renderCard)}
              {columns.idle.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无空闲会话" className="empty-placeholder" />}
            </div>
          </div>

          <div className="kanban-column">
            <div className="column-header">
              <h3>正在执行 <Badge status="processing" count={columns.running.length} offset={[10, -5]} /></h3>
            </div>
            <div className="card-list">
              {columns.running.map(renderCard)}
              {columns.running.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无执行中任务" className="empty-placeholder" />}
            </div>
          </div>

          <div className="kanban-column">
            <div className="column-header">
              <h3>已完成 <Badge count={columns.completed.length} offset={[10, -5]} color="#3fb950" /></h3>
            </div>
            <div className="card-list">
              {columns.completed.map(renderCard)}
              {columns.completed.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史纪录" className="empty-placeholder" />}
            </div>
          </div>
        </div>
      )}

      {/* 继续聊天弹框 */}
      <Modal
        title={`继续会话 - ${selectedSession?.agentName}`}
        open={isLaunchModalOpen}
        onOk={handleLaunch}
        onCancel={() => setIsLaunchModalOpen(false)}
        confirmLoading={processing}
        okText="直接启动"
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">正在向会话 {selectedSession?.sessionId?.substring(0, 8) || '新起点'} 发送新指令</Text>
        </div>
        <Input.TextArea
          placeholder="请输入任务内容..."
          autoSize={{ minRows: 3, maxRows: 6 }}
          value={launchPrompt}
          onChange={e => setLaunchPrompt(e.target.value)}
        />
      </Modal>

      {/* 新增会话弹框 */}
      <Modal
        title="创建新会话"
        open={isAddModalOpen}
        onOk={handleAddNewSession}
        onCancel={() => setIsAddModalOpen(false)}
        confirmLoading={processing}
        okText="确定"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Text strong>选择 Agent *</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              placeholder="请选择"
              value={newAgentId}
              onChange={setNewAgentId}
            >
              {agents.map(a => (
                <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>
              ))}
            </Select>
          </div>
          <div>
            <Text strong>初始任务 (可选)</Text>
            <Input.TextArea
              style={{ marginTop: 8 }}
              placeholder="输入任务则立即启动，不输入则仅创建占位符"
              autoSize={{ minRows: 3, maxRows: 6 }}
              value={newPrompt}
              onChange={e => setNewPrompt(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

// 补齐缺少的图标
const SyncOutlined = (props: any) => <ReloadOutlined {...props} />;

export default KanbanPage;
