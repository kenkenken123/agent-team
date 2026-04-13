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
import { commonPathApi } from '../../api/commonPathApi';
import { statsApi } from '../../api/taskApi';
import { getModelConfigs } from '../../api/configApi';
import type { Agent, AgentTemplate, CommonPath, CreateAgentRequest, UpdateAgentRequest, CreateAgentTemplateRequest, UpdateAgentTemplateRequest, CreateCommonPathRequest } from '../../types';
import './Agents.css';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;

// 移除了硬编码的 MODELS 数组

const AgentsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('agents');
  
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [commonPaths, setCommonPaths] = useState<CommonPath[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [commonPathDrawerOpen, setCommonPathDrawerOpen] = useState(false);

  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<AgentTemplate | null>(null);

  const [dirValid, setDirValid] = useState<boolean | null>(null);

  const [agentForm] = Form.useForm();
  const [templateForm] = Form.useForm();
  const [commonPathForm] = Form.useForm();

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ts, as, ps, ms] = await Promise.all([
        agentTemplateApi.getAll(),
        agentApi.getAll(),
        commonPathApi.getAll(),
        getModelConfigs()
      ]);
      setTemplates(ts);
      setAgents(as);
      setCommonPaths(ps);
      setAvailableModels(ms.data.map(m => m.modelId));
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
    agentForm.setFieldsValue({ allowedModels: ['claude-3-7-sonnet-20250219'], isEnabled: true });
    setAgentDrawerOpen(true);
  };

  const openEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setDirValid(agent.workingDirectory ? true : null);
    agentForm.setFieldsValue({ 
      ...agent, 
      templateId: agent.templateId,
      allowedModels: agent.allowedModels?.split(',') || ['claude-3-7-sonnet-20250219']
    });
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
      allowedModels: Array.isArray(values.allowedModels) ? values.allowedModels.join(',') : values.allowedModels,
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

  // -- Common Path Handlers --
  const openCreateCommonPath = () => {
    commonPathForm.resetFields();
    setCommonPathDrawerOpen(true);
  };

  const handleDeleteCommonPath = async (id: string) => {
    await commonPathApi.delete(id);
    message.success('路径已从常用列表移除');
    loadAll();
  };

  const handleSaveCommonPath = async () => {
    const values = await commonPathForm.validateFields();
    await commonPathApi.create(values as CreateCommonPathRequest);
    message.success('路径已保存到常用列表');
    setCommonPathDrawerOpen(false);
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
      title: '模型范围',
      dataIndex: 'allowedModels',
      key: 'allowedModels',
      render: (models: string) => (
        <Space size={[0, 4]} wrap>
          {models.split(',').map(m => <Tag key={m} color="purple">{m}</Tag>)}
        </Space>
      ),
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
        <Typography.Title level={3} style={{ margin: 0, color: '#E6EDF3', fontWeight: 800 }}>Agent 管理</Typography.Title>
      </div>

      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab} 
        className="glass-tabs"
        tabBarExtraContent={
          activeTab === 'agents' 
            ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreateAgent} style={{ borderRadius: 8 }}>新建 Agent 实例</Button>
            : activeTab === 'templates'
              ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreateTemplate} style={{ borderRadius: 8 }}>新建 模板</Button>
              : <Button type="primary" icon={<PlusOutlined />} onClick={openCreateCommonPath} style={{ borderRadius: 8 }}>添加常用目录</Button>
        }
      >
        <TabPane tab="Agent 实例" key="agents">
          <div className="agents-table-container">
            <Table className="agents-table" columns={agentColumns} dataSource={agents} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
          </div>
        </TabPane>
        <TabPane tab="Agent 模板" key="templates">
          <div className="agents-table-container">
            <Table className="agents-table" columns={templateColumns} dataSource={templates} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
          </div>
        </TabPane>
        <TabPane tab="常用目录" key="common-paths">
          <div className="agents-table-container">
            <Table 
              className="agents-table" 
              dataSource={commonPaths}
              rowKey="id"
              columns={[
                { 
                  title: '目录全路径', 
                  dataIndex: 'path', 
                  key: 'path', 
                  ellipsis: true,
                  render: p => <code style={{ color: '#8B949E' }}>{p}</code> 
                },
                { 
                  title: '别名/说明', 
                  dataIndex: 'name', 
                  key: 'name', 
                  width: 250,
                  render: n => <span style={{ color: '#E6EDF3', fontWeight: 600 }}>{n}</span> 
                },
                { 
                  title: '添加时间', 
                  dataIndex: 'createdAt', 
                  key: 'createdAt', 
                  width: 200,
                  render: d => <span style={{ color: '#8B949E', fontSize: 13 }}>{new Date(d).toLocaleString()}</span> 
                },
                { 
                  title: '操作', 
                  key: 'actions', 
                  width: 100,
                  render: (_, r) => (
                    <Popconfirm title="移除常用路径？" onConfirm={() => handleDeleteCommonPath(r.id)}>
                      <Button type="text" icon={<DeleteOutlined />} danger size="small" />
                    </Popconfirm>
                  ) 
                }
              ]}
            />
          </div>
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
            label={<span>操作目录 <Tooltip title="留空则表示每次启动任务时手动选择"><Text type="secondary" style={{ fontSize: 12 }}>(可选)</Text></Tooltip></span>}
            validateStatus={dirValid === false ? 'error' : dirValid === true ? 'success' : undefined}
            help={dirValid === false ? '目录不存在' : dirValid === true ? '目录有效' : (<span>留空则运行任务时再指定</span>)}
          >
            <Input.Search placeholder="例如 D:\projects\my-app" enterButton={<><FolderOpenOutlined /> 验证</>} onSearch={validateDir} />
          </Form.Item>
          <Form.Item name="allowedModels" label="允许选用的模型范围" rules={[{ required: true, message: '请至少选择一个模型' }]}>
            <Select mode="multiple" placeholder="选择使用的模型" options={availableModels.map(m => ({ label: m, value: m }))} />
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

      {/* --- 常用目录 Drawer --- */}
      <Drawer
        title="添加常用目录"
        open={commonPathDrawerOpen}
        onClose={() => setCommonPathDrawerOpen(false)}
        width={400}
        extra={<Button type="primary" onClick={handleSaveCommonPath}>保存</Button>}
        styles={{ body: { background: '#0D1117' }, header: { background: '#161B22', borderBottom: '1px solid #21262D' } }}
      >
        <Form form={commonPathForm} layout="vertical" className="agent-form">
          <Form.Item name="path" label="目录全路径" rules={[{ required: true, message: '请输入路径' }]}>
            <Input placeholder="D:\projects\work" />
          </Form.Item>
          <Form.Item name="name" label="别名/说明" rules={[{ required: true, message: '请输入描述' }]}>
            <Input placeholder="我的主工作区" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default AgentsPage;
