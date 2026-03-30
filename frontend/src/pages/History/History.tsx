import React, { useEffect, useState } from 'react';
import { Table, Select, Typography, Space, Tooltip } from 'antd';
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    agentApi.getAll().then(setAgents);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await taskApi.getAll({
        agentId: filterAgentId,
        status: filterStatus,
      });
      setTasks(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterAgentId, filterStatus]);

  const columns: ColumnsType<AgentTask> = [
    {
      title: 'Agent',
      dataIndex: 'agentName',
      key: 'agentName',
      render: (name) => (
        <Space>
          <RobotOutlined style={{ color: '#58A6FF' }} />
          <span style={{ color: '#C9D1D9' }}>{name}</span>
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
      render: (s) => <TaskStatusTag status={s} />,
    },
    {
      title: '会话 ID',
      dataIndex: 'claudeSessionId',
      key: 'claudeSessionId',
      render: (id) => id
        ? <code style={{ color: '#8B949E', fontSize: 11 }}>{id.substring(0, 16)}...</code>
        : <span style={{ color: '#484F58' }}>—</span>,
    },
    {
      title: 'Input Tokens',
      dataIndex: 'inputTokens',
      key: 'inputTokens',
      render: (v) => <span style={{ color: '#79C0FF' }}>{v?.toLocaleString() ?? '—'}</span>,
    },
    {
      title: 'Output Tokens',
      dataIndex: 'outputTokens',
      key: 'outputTokens',
      render: (v) => <span style={{ color: '#56D364' }}>{v?.toLocaleString() ?? '—'}</span>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (t) => <span style={{ color: '#6E7681', fontSize: 12 }}>{new Date(t).toLocaleString('zh-CN')}</span>,
    },
    {
      title: '耗时',
      key: 'duration',
      render: (_, r) => {
        if (!r.startedAt || !r.completedAt) return <span style={{ color: '#484F58' }}>—</span>;
        const sec = Math.round((new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) / 1000);
        return <span style={{ color: '#8B949E' }}>{sec}s</span>;
      },
    },
  ];

  return (
    <div className="history-page">
      <div className="history-header">
        <Title level={3} style={{ margin: 0, color: '#F0F6FC' }}>任务历史</Title>
        <Space>
          <Select
            style={{ width: 180 }}
            placeholder="筛选 Agent"
            allowClear
            value={filterAgentId}
            onChange={setFilterAgentId}
            options={agents.map(a => ({ label: a.name, value: a.id }))}
          />
          <Select
            style={{ width: 130 }}
            placeholder="筛选状态"
            allowClear
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { label: '运行中', value: 'Running' },
              { label: '已完成', value: 'Completed' },
              { label: '失败', value: 'Failed' },
              { label: '已取消', value: 'Cancelled' },
            ]}
          />
        </Space>
      </div>

      <Table
        className="history-table"
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
};

export default HistoryPage;
