import React, { useEffect, useState } from 'react';
import { Table, Select, Typography, Space, Tooltip, Input } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { agentApi } from '../../api/agentApi';
import { taskApi } from '../../api/taskApi';
import type { Agent, AgentTask } from '../../types';
import TaskStatusTag from '../../components/TaskStatusTag';
import './History.css';

const { Title } = Typography;

const HistoryPage: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [filterAgentId, setFilterAgentId] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterSessionId, setFilterSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    agentApi.getAll().then(setAgents);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await taskApi.getAll({
          agentId: filterAgentId,
          status: filterStatus,
          sessionId: filterSessionId,
          skip: (currentPage - 1) * pageSize,
          take: pageSize,
        });
        setTasks(data.items);
        setTotal(data.total);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentPage, filterAgentId, filterStatus, filterSessionId]);

  const columns: ColumnsType<AgentTask> = [
    {
      title: 'Agent',
      dataIndex: 'agentName',
      key: 'agentName',
      width: 180,
      render: (name) => (
        <Space>
          <RobotOutlined style={{ color: '#58A6FF', fontSize: 16 }} />
          <span style={{ color: '#E6EDF3', fontWeight: 700 }}>{name}</span>
        </Space>
      ),
    },
    {
      title: '任务指令',
      dataIndex: 'prompt',
      key: 'prompt',
      ellipsis: true,
      render: (p) => <Tooltip title={p}><span style={{ color: '#8B949E' }}>{p}</span></Tooltip>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s) => (
        <span style={{ 
          color: '#3FB950', 
          background: 'rgba(63, 185, 80, 0.1)', 
          padding: '2px 8px', 
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold',
          border: '1px solid rgba(63, 185, 80, 0.2)'
        }}>
          {s === 'Completed' ? '已完成' : s === 'Running' ? '正在执行' : s === 'Failed' ? '执行失败' : '已取消'}
        </span>
      ),
    },
    {
      title: '会话 ID',
      dataIndex: 'claudeSessionId',
      key: 'claudeSessionId',
      width: 200,
      render: (id) => id
        ? <code style={{ color: '#8B949E', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{id.substring(0, 18)}...</code>
        : <span style={{ color: '#484F58' }}>—</span>,
    },
    {
      title: 'Input Tokens',
      dataIndex: 'inputTokens',
      key: 'inputTokens',
      width: 120,
      render: (v) => <span style={{ color: '#58A6FF', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>{v?.toLocaleString() ?? '0'}</span>,
    },
    {
      title: 'Output Tokens',
      dataIndex: 'outputTokens',
      key: 'outputTokens',
      width: 120,
      render: (v) => <span style={{ color: '#3FB950', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>{v?.toLocaleString() ?? '0'}</span>,
    },
    {
      title: 'Cache Read',
      dataIndex: 'cacheReadTokens',
      key: 'cacheReadTokens',
      width: 110,
      render: (v) => <span style={{ color: '#A371F7', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>{v?.toLocaleString() ?? '0'}</span>,
    },
    {
      title: 'Cache Create',
      dataIndex: 'cacheCreationTokens',
      key: 'cacheCreationTokens',
      width: 120,
      render: (v) => <span style={{ color: '#D29922', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>{v?.toLocaleString() ?? '0'}</span>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t) => <span style={{ color: '#8B949E', fontSize: 13 }}>{new Date(t).toLocaleString('zh-CN')}</span>,
    },
    {
      title: '耗时',
      key: 'duration',
      width: 100,
      render: (_, r) => {
        if (!r.startedAt || !r.completedAt) return <span style={{ color: '#484F58' }}>—</span>;
        const sec = Math.round((new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) / 1000);
        return <span style={{ color: '#D29922', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{sec}s</span>;
      },
    },
  ];

  return (
    <div className="history-page">
      <div className="history-header">
        <Title level={3} style={{ margin: 0, color: '#E6EDF3', fontWeight: 800 }}>任务历史</Title>
        <Space size={16}>
          <Input.Search
            className="glass-search"
            style={{ width: 240 }}
            placeholder="搜索会话 ID"
            allowClear
            onSearch={val => { setFilterSessionId(val || undefined); setCurrentPage(1); }}
          />
          <Select
            className="glass-select"
            style={{ width: 180 }}
            placeholder="筛选 Agent"
            allowClear
            value={filterAgentId}
            onChange={(val) => { setFilterAgentId(val); setCurrentPage(1); }}
            options={agents.map(a => ({ label: a.name, value: a.id }))}
          />
          <Select
            className="glass-select"
            style={{ width: 140 }}
            placeholder="筛选状态"
            allowClear
            value={filterStatus}
            onChange={(val) => { setFilterStatus(val); setCurrentPage(1); }}
            options={[
              { label: '运行中', value: 'Running' },
              { label: '已完成', value: 'Completed' },
              { label: '失败', value: 'Failed' },
              { label: '已取消', value: 'Cancelled' },
            ]}
          />
        </Space>
      </div>

      <div className="history-table-container">
        <Table
          className="history-table"
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          pagination={{
            current: currentPage,
            total,
            pageSize,
            showSizeChanger: false,
            className: "glass-pagination",
            onChange: (page) => setCurrentPage(page),
          }}
        />
      </div>
    </div>
  );
};

export default HistoryPage;
