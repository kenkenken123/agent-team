import React, { useEffect, useState } from 'react';
import {
  Table, Button, Tag, Drawer, Form, Input, InputNumber,
  Switch, Space, Popconfirm, message, Typography, Tooltip,
  Select, Tabs,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  FolderOpenOutlined, RobotOutlined, FileTextOutlined
} from '@ant-design/icons';

import type { ColumnsType } from 'antd/es/table';
import { agentApi } from '../../api/agentApi';
import { agentTemplateApi } from '../../api/agentTemplateApi';
import { statsApi } from '../../api/taskApi';
import type { Agent, AgentTemplate, CreateAgentRequest, UpdateAgentRequest, CreateAgentTemplateRequest, UpdateAgentTemplateRequest } from '../../types';
import './Agents.css';

const { Title } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;

export const MODELS = [
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
  const [activeTab, setActiveTab] = useState('agents');
  
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);

  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<AgentTemplate | null>(null);

  const [dirValid, setDirValid] = useState<boolean | null>(null);

  const [agentForm] = Form.useForm();
  const [templateForm] = Form.useForm();

  const loadAll = async () => {
    setLoading(true);
    try {
      const ts = await agentTemplateApi.getAll();
      setTemplates(ts);
      const as = await agentApi.getAll();
      setAgents(as);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // -- Template Handlers --
  const openCreateTemplate = () => {
    setEditingTemplate(null);
    templateForm.resetFields();
    templateForm.setFieldsValue({ isEnabled: true });
    setTemplateDrawerOpen(true);
  };

  const openEditTemplate = (tmpl: AgentTemplate) => {
    setEditingTemplate(tmpl);
    templateForm.setFieldsValue(tmpl);
    setTemplateDrawerOpen(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    await agentTemplateApi.delete(id);
    message.success('模板已删除');
    loadAll();
  };

  const handleSaveTemplate = async () => {
    const values = await templateForm.validateFields();
    if (editingTemplate) {
      await agentTemplateApi.update(editingTemplate.id, values as UpdateAgentTemplateRequest);
      message.success('模板已更新');
    } else {
      await agentTemplateApi.create(values as CreateAgentTemplateRequest);
      message.success('模板已创建');
    }
    setTemplateDrawerOpen(false);
    loadAll();
  };

  // -- Agent Handlers --
  const openCreateAgent = () => {
    setEditingAgent(null);
    setDirValid(null);
    agentForm.resetFields();
    agentForm.setFieldsValue({ model: 'claude-3-7-sonnet-20250219', isEnabled: true });
    setAgentDrawerOpen(true);
  };

  const openEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setDirValid(true);
    agentForm.setFieldsValue({ ...agent, templateId: agent.templateId });
    setAgentDrawerOpen(true);
  };

  const handleDeleteAgent = async (id: string) => {
    await agentApi.delete(id);
    message.success('Agent 已删除');
    loadAll();
  };

  const handleSaveAgent = async () => {
    const values = await agentForm.validateFields();
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
    setAgentDrawerOpen(false);
    loadAll();
  };

  const validateDir = async () => {
    const dir = agentForm.getFieldValue('workingDirectory');
    if (!dir) return;
    const { exists } = await statsApi.validateDirectory(dir);
    setDirValid(exists);
    if (!exists) message.warning('目录不存在，请检查路径');
  };

  const templateColumns: ColumnsType<AgentTemplate> = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      render: (name, rec) => (
        <Space>
          <FileTextOutlined style={{ color: '#58A6FF' }} />
          <span style={{ color: '#C9D1D9', fontWeight: 500 }}>{name}</span>
          {!rec.isEnabled && <Tag color="default">已禁用</Tag>}
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
      title: '系统提示词',
      dataIndex: 'systemPrompt',
      key: 'systemPrompt',
      ellipsis: true,
      render: (sp) => <span style={{ color: '#8B949E' }}>{sp}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} size="small" onClick={() => openEditTemplate(record)} style={{ color: '#58A6FF' }} />
          <Popconfirm title="确认删除此模板？" onConfirm={() => handleDeleteTemplate(record.id)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button type="text" icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const agentColumns: ColumnsType<Agent> = [
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
      title: '所用模板',
      key: 'templateName',
      render: (_, rec) => <span style={{ color: '#8B949E' }}>{rec.template?.name || '未知模板'}</span>,
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
          <Button type="text" icon={<EditOutlined />} size="small" onClick={() => openEditAgent(record)} style={{ color: '#58A6FF' }} />
          <Popconfirm title="确认删除此 Agent？" onConfirm={() => handleDeleteAgent(record.id)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
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
      </div>

      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab} 
        tabBarExtraContent={
          activeTab === 'agents' 
            ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreateAgent}>新建 Agent 实例</Button>
            : <Button type="primary" icon={<PlusOutlined />} onClick={openCreateTemplate}>新建 模板</Button>
        }
      >
        <TabPane tab="Agent 实例" key="agents">
          <Table className="agents-table" columns={agentColumns} dataSource={agents} rowKey="id" loading={loading} pagination={{ pageSize: 15 }} />
        </TabPane>
        <TabPane tab="Agent 模板" key="templates">
          <Table className="agents-table" columns={templateColumns} dataSource={templates} rowKey="id" loading={loading} pagination={{ pageSize: 15 }} />
        </TabPane>
      </Tabs>

      {/* --- 模板 Drawer --- */}
      <Drawer
        title={editingTemplate ? '编辑模板' : '新建模板'}
        open={templateDrawerOpen}
        onClose={() => setTemplateDrawerOpen(false)}
        width={560}
        extra={<Button type="primary" onClick={handleSaveTemplate}>保存</Button>}
        styles={{ body: { background: '#0D1117' }, header: { background: '#161B22', borderBottom: '1px solid #21262D' } }}
      >
        <Form form={templateForm} layout="vertical" className="agent-form">
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input placeholder="例如：前端开发专家" />
          </Form.Item>
          <Form.Item name="description" label="模板描述">
            <Input placeholder="简要描述模板能力" />
          </Form.Item>
          <Form.Item name="systemPrompt" label="系统提示词" rules={[{ required: true, message: '请输入系统提示词' }]}>
            <TextArea rows={5} placeholder="你是一个专业的前端开发工程师，擅长 React 和 TypeScript..." />
          </Form.Item>
          {editingTemplate && (
            <Form.Item name="isEnabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Drawer>

      {/* --- Agent 实例 Drawer --- */}
      <Drawer
        title={editingAgent ? '编辑 Agent 实例' : '新建 Agent 实例'}
        open={agentDrawerOpen}
        onClose={() => setAgentDrawerOpen(false)}
        width={560}
        extra={<Button type="primary" onClick={handleSaveAgent}>保存</Button>}
        styles={{ body: { background: '#0D1117' }, header: { background: '#161B22', borderBottom: '1px solid #21262D' } }}
      >
        <Form form={agentForm} layout="vertical" className="agent-form">
          <Form.Item name="name" label="实例名称" rules={[{ required: true, message: '请输入实例名称' }]}>
            <Input placeholder="例如：前端应用-1" />
          </Form.Item>
          <Form.Item name="templateId" label="选择模板" rules={[{ required: true, message: '请选择基于的模板' }]}>
             <Select placeholder="选择关联的模板">
                {templates.map(t => <Select.Option key={t.id} value={t.id}>{t.name}</Select.Option>)}
             </Select>
          </Form.Item>
          <Form.Item
            name="workingDirectory"
            label="操作目录"
            rules={[{ required: true, message: '请输入操作目录路径' }]}
            validateStatus={dirValid === false ? 'error' : dirValid === true ? 'success' : undefined}
            help={dirValid === false ? '目录不存在' : dirValid === true ? '目录有效' : undefined}
          >
            <Input.Search placeholder="D:\projects\my-app" enterButton={<><FolderOpenOutlined /> 验证</>} onSearch={validateDir} />
          </Form.Item>
          <Form.Item name="model" label="默认模型" rules={[{ required: true, message: '请选择模型' }]}>
            <Select mode="tags" placeholder="选择使用的模型" options={MODELS.map(m => ({ label: m, value: m }))} maxCount={1} />
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
