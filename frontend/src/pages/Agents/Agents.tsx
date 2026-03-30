import React, { useEffect, useState } from 'react';
import {
  Table, Button, Tag, Drawer, Form, Input, InputNumber,
  Switch, Space, Popconfirm, message, Typography, Tooltip,
  Select,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  FolderOpenOutlined, RobotOutlined,
} from '@ant-design/icons';

import type { ColumnsType } from 'antd/es/table';
import { agentApi } from '../../api/agentApi';
import { statsApi } from '../../api/taskApi';
import type { Agent, CreateAgentRequest, UpdateAgentRequest } from '../../types';
import './Agents.css';

const { Title } = Typography;
const { TextArea } = Input;

const MODELS = [
  'claude-3-7-sonnet-20250219',
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-haiku-4-5',
  'Doubao-Seed-2.0-pro',
  'minimax-m2.5',
  'Kimi-K2.5',
  'glm-5',
];


const AgentsPage: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [dirValid, setDirValid] = useState<boolean | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await agentApi.getAll();
      setAgents(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingAgent(null);
    setDirValid(null);
    form.resetFields();
    form.setFieldsValue({ model: 'claude-sonnet-4-5', isEnabled: true });
    setDrawerOpen(true);
  };

  const openEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setDirValid(true);
    form.setFieldsValue(agent);
    setDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    await agentApi.delete(id);
    message.success('Agent 已删除');
    load();
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    
    // 处理 model 字段：如果是数组（tags 模式），取第一个
    const submitData = {
      ...values,
      model: Array.isArray(values.model) ? values.model[0] : values.model,
    };

    if (editingAgent) {
      await agentApi.update(editingAgent.id, submitData as UpdateAgentRequest);
      message.success('Agent 已更新');
    } else {
      await agentApi.create(submitData as CreateAgentRequest);
      message.success('Agent 已创建');
    }
    setDrawerOpen(false);
    load();
  };


  const validateDir = async () => {
    const dir = form.getFieldValue('workingDirectory');
    if (!dir) return;
    const { exists } = await statsApi.validateDirectory(dir);
    setDirValid(exists);
    if (!exists) message.warning('目录不存在，请检查路径');
  };

  const columns: ColumnsType<Agent> = [
    {
      title: 'Agent 名称',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space>
          <RobotOutlined style={{ color: '#58A6FF' }} />
          <span style={{ color: '#C9D1D9', fontWeight: 500 }}>{name}</span>
          {!record.isEnabled && <Tag color="default">已禁用</Tag>}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc) => <span style={{ color: '#8B949E' }}>{desc}</span>,
    },
    {
      title: '工作目录',
      dataIndex: 'workingDirectory',
      key: 'workingDirectory',
      ellipsis: true,
      render: (dir) => (
        <Tooltip title={dir}>
          <Space>
            <FolderOpenOutlined style={{ color: '#D29922' }} />
            <code style={{ color: '#8B949E', fontSize: 12 }}>{dir}</code>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: '模型',
      dataIndex: 'model',
      key: 'model',
      render: (model) => <Tag color="purple">{model}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            size="small"
            onClick={() => openEdit(record)}
            style={{ color: '#58A6FF' }}
          />
          <Popconfirm
            title="确认删除此 Agent？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="agents-page">
      <div className="agents-header">
        <Title level={3} style={{ margin: 0, color: '#F0F6FC' }}>Agent 管理</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
        >
          新建 Agent
        </Button>
      </div>

      <Table
        className="agents-table"
        columns={columns}
        dataSource={agents}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15 }}
      />

      <Drawer
        title={editingAgent ? '编辑 Agent' : '新建 Agent'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
        extra={
          <Button type="primary" onClick={handleSave}>保存</Button>
        }
        styles={{ body: { background: '#0D1117' }, header: { background: '#161B22', borderBottom: '1px solid #21262D' } }}
      >
        <Form form={form} layout="vertical" className="agent-form">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入 Agent 名称' }]}>
            <Input placeholder="例如：前端开发专家" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input placeholder="简要描述此 Agent 的职责" />
          </Form.Item>

          <Form.Item
            name="workingDirectory"
            label="工作目录"
            rules={[{ required: true, message: '请输入工作目录路径' }]}
            validateStatus={dirValid === false ? 'error' : dirValid === true ? 'success' : undefined}
            help={dirValid === false ? '目录不存在' : dirValid === true ? '目录有效' : undefined}
          >
            <Input.Search
              placeholder="D:\projects\my-app"
              enterButton={<><FolderOpenOutlined /> 验证</>}
              onSearch={validateDir}
            />
          </Form.Item>

          <Form.Item name="systemPrompt" label="系统提示词" rules={[{ required: true, message: '请输入系统提示词' }]}>
            <TextArea
              rows={5}
              placeholder="你是一个专业的前端开发工程师，擅长 React 和 TypeScript..."
            />
          </Form.Item>

          <Form.Item name="model" label="模型" rules={[{ required: true, message: '请选择或输入模型 ID' }]}>
            <Select
              mode="tags"
              placeholder="选择或输入模型 ID (如 Doubao-Seed-2.0-pro)"
              options={MODELS.map(m => ({ label: m, value: m }))}
              maxCount={1}
            />
          </Form.Item>


          <Form.Item name="maxTurns" label="最大对话轮数">
            <InputNumber min={1} max={100} placeholder="不限制" style={{ width: '100%' }} />
          </Form.Item>

          {editingAgent && (
            <Form.Item name="isEnabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
};

export default AgentsPage;
