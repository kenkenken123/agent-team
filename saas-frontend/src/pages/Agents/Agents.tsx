import { useState, useEffect, useRef } from 'react';
import { Card, Button, Input, Modal, Form, Select, Row, Col, Space, Typography, message, Tag, List, Switch, Drawer } from 'antd';
import { PlayCircleOutlined, ConsoleSqlOutlined, LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, PlusOutlined } from '@ant-design/icons';
import { agentsApi, tasksApi } from '../../api/saasApi';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

interface Agent {
  id: string;
  name: string;
  templateId: string;
  templateName?: string;
  workingDirectory: string;
  allowedModels: string;
  maxTurns?: number;
  isEnabled: boolean;
  status: string;
  createdAt: string;
}

interface Task {
  id: string;
  prompt: string;
  status: string;
  createdAt: string;
  claudeSessionId?: string;
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [form] = Form.useForm();

  const [terminalOpen, setTerminalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [taskOutput, setTaskOutput] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [planMode, setPlanMode] = useState(false);
  const [isStartingTask, setIsStartingTask] = useState(false);
  const [activeModel, setActiveModel] = useState('claude-3-7-sonnet-20250219');
  const [sessionOption, setSessionOption] = useState('resume');

  const wsRef = useRef<WebSocket | null>(null);
  const outputEndRef = useRef<HTMLDivElement | null>(null);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const data = await agentsApi.getAgents();
      setAgents(data);
      
      const tmps = await agentsApi.getTemplates();
      setTemplates(tmps);
    } catch (err: any) {
      message.error(err.message || '加载 Agents 失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const handleCreateAgent = async (values: any) => {
    try {
      await agentsApi.createAgent({
        name: values.name,
        templateId: values.templateId,
        workingDirectory: values.workingDirectory || '',
        allowedModels: values.allowedModels || 'claude-3-7-sonnet-20250219',
        maxTurns: values.maxTurns ? parseInt(values.maxTurns) : 30,
      });
      message.success('创建 Agent 成功');
      setCreateVisible(false);
      form.resetFields();
      loadAgents();
    } catch (err: any) {
      message.error(err.message || '创建失败');
    }
  };

  const openTerminal = async (agent: Agent) => {
    setSelectedAgent(agent);
    setTerminalOpen(true);
    setTaskOutput('');
    setActiveTask(null);
    setTaskPrompt('');
    loadTasks(agent.id);
  };

  const loadTasks = async (agentId: string) => {
    try {
      const res = await tasksApi.getTasks({ agentId, take: 10 });
      setTasks(res.items || []);
    } catch (err: any) {
      message.error('加载历史任务失败');
    }
  };

  const selectTask = async (task: Task) => {
    setActiveTask(task);
    setTaskOutput('正在读取任务日志...');
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const res = await tasksApi.getTaskOutput(task.id);
      const cleanText = (res.content || '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
      setTaskOutput(cleanText || '(无日志输出)');
      
      if (task.status === 'Running') {
        connectWebSocket(task.id);
      }
    } catch (err: any) {
      setTaskOutput('获取日志失败: ' + err.message);
    }
  };

  const connectWebSocket = (taskId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = `ws://localhost:5501/ws/task/${taskId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'output' && data.content) {
          const cleanChunk = data.content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
          setTaskOutput((prev) => prev + cleanChunk);
          
          setTimeout(() => {
            outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        } else if (data.type === 'status' && data.status) {
          if (selectedAgent) loadTasks(selectedAgent.id);
          message.info(`任务状态变更: ${data.status}`);
        }
      } catch (e) {
      }
    };
  };

  const handleStartTask = async () => {
    if (!selectedAgent || !taskPrompt.trim()) return;
    setIsStartingTask(true);
    try {
      const res = await tasksApi.createTask({
        agentId: selectedAgent.id,
        prompt: taskPrompt.trim(),
        planMode: planMode,
        terminalType: 'powershell',
        model: activeModel,
        forceNewSession: sessionOption === 'new',
        resumeSessionId: sessionOption === 'resume-selected' && activeTask?.claudeSessionId ? activeTask.claudeSessionId : undefined,
      });
      message.success('任务启动成功！');
      setTaskPrompt('');
      loadTasks(selectedAgent.id);
      selectTask(res);
    } catch (err: any) {
      message.error(err.message || '启动任务失败');
    } finally {
      setIsStartingTask(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      await tasksApi.cancelTask(taskId);
      message.success('取消指令已下发');
      if (selectedAgent) loadTasks(selectedAgent.id);
    } catch (err: any) {
      message.error(err.message || '取消失败');
    }
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'Running':
        return <Tag color="processing" icon={<SyncOutlined spin />}>运行中</Tag>;
      case 'Completed':
        return <Tag color="success" icon={<CheckCircleOutlined />}>已完成</Tag>;
      case 'Failed':
        return <Tag color="error" icon={<CloseCircleOutlined />}>失败</Tag>;
      case 'Cancelled':
        return <Tag color="default">已取消</Tag>;
      default:
        return <Tag color="default">{status}</Tag>;
    }
  };

  return (
    <div style={{ padding: '8px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 700 }} className="gradient-text">
            我的 Agents 管理
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.45)', margin: '8px 0 0 0' }}>
            在此您可以为您的专属工作区配置 Agent，并通过控制台向 Claude Code 发送自然语言开发指令。
          </Paragraph>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateVisible(true)}
          className="glow-btn"
        >
          创建 Agent
        </Button>
      </div>

      <Row gutter={[24, 24]}>
        {agents.map((agent) => (
          <Col xs={24} md={12} lg={8} key={agent.id}>
            <Card
              bordered={false}
              className="glass-card"
              title={agent.name}
              extra={
                <Tag color={agent.isEnabled ? 'green' : 'red'}>
                  {agent.isEnabled ? '已启用' : '已禁用'}
                </Tag>
              }
              actions={[
                <Button
                  type="link"
                  icon={<ConsoleSqlOutlined />}
                  onClick={() => openTerminal(agent)}
                  disabled={!agent.isEnabled}
                >
                  终端控制台
                </Button>,
              ]}
            >
              <Paragraph style={{ color: 'rgba(255,255,255,0.65)' }}>
                <b>关联模板</b>: {agent.templateName || '通用助手'}<br />
                <b>沙箱子目录</b>: <code>/ {agent.workingDirectory.split('user/')[1]?.split('/').slice(1).join('/') || '(根目录)'}</code><br />
                <b>所用模型</b>: {agent.allowedModels}<br />
                <b>最大轮次</b>: {agent.maxTurns || 30}
              </Paragraph>
            </Card>
          </Col>
        ))}
        {agents.length === 0 && !loading && (
          <div style={{ width: '100%', padding: '48px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>
            没有找到任何 Agents，点击右上方「创建 Agent」开始创建。
          </div>
        )}
      </Row>

      <Modal
        title="创建新 Agent"
        open={createVisible}
        onCancel={() => setCreateVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreateAgent} style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Agent 名称"
            rules={[{ required: true, message: '请输入 Agent 名称' }]}
          >
            <Input placeholder="例如: 前端修改助手" />
          </Form.Item>
          <Form.Item
            name="templateId"
            label="绑定系统角色模板"
            rules={[{ required: true, message: '请选择角色模板' }]}
          >
            <Select placeholder="选择一个内置模板角色">
              {templates.map((t) => (
                <Select.Option key={t.id} value={t.id}>
                  {t.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="workingDirectory"
            label="工作沙箱相对路径"
            help="指定此 Agent 在您专属文件夹下的哪一个相对子目录中工作（留空代表用户根目录）"
          >
            <Input placeholder="例如: projects/web-app" />
          </Form.Item>
          <Form.Item
            name="allowedModels"
            label="模型选择"
            initialValue="claude-3-7-sonnet-20250219"
          >
            <Select>
              <Select.Option value="claude-3-7-sonnet-20250219">claude-3-7-sonnet-20250219</Select.Option>
              <Select.Option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="maxTurns"
            label="允许执行最大轮次"
            initialValue="30"
          >
            <Input type="number" />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setCreateVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit" className="glow-btn">
                确认创建
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={selectedAgent ? `控制台终端: ${selectedAgent.name}` : '终端'}
        placement="right"
        width={960}
        onClose={() => {
          setTerminalOpen(false);
          if (wsRef.current) wsRef.current.close();
        }}
        open={terminalOpen}
        bodyStyle={{ display: 'flex', flexDirection: 'column', background: '#0b0c11', padding: '16px' }}
      >
        <Row style={{ flex: 1, minHeight: 0 }} gutter={16}>
          <Col span={8} style={{ height: '100%', overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 600 }}>指令执行历史</div>
            <List
              dataSource={tasks}
              renderItem={(item) => (
                <List.Item
                  onClick={() => selectTask(item)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px',
                    borderRadius: '6px',
                    border: 'none',
                    marginBottom: '8px',
                    background: activeTask?.id === item.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                    {getStatusTag(item.status)}
                  </div>
                  <div style={{ color: '#d9d9d9', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                    {item.prompt}
                  </div>
                  {item.status === 'Running' && (
                    <Button
                      size="small"
                      danger
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelTask(item.id);
                      }}
                      style={{ marginTop: 8, fontSize: 11 }}
                    >
                      强制停止
                    </Button>
                  )}
                </List.Item>
              )}
            />
          </Col>

          <Col span={16} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>流式执行控制台</span>
              {activeTask?.status === 'Running' && (
                <span style={{ color: '#1890ff', fontSize: 13 }}><LoadingOutlined /> Claude 正在实时处理中...</span>
              )}
            </div>

            <div
              style={{
                flex: 1,
                background: '#040508',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '12px',
                fontFamily: 'Consolas, monospace',
                fontSize: 12,
                color: '#33ff33',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                marginBottom: '16px',
              }}
            >
              {taskOutput}
              <div ref={outputEndRef} />
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: 13 }}>选择模型:</span>
                <Select
                  value={activeModel}
                  onChange={(val) => setActiveModel(val)}
                  style={{ width: 200 }}
                  size="small"
                >
                  <Select.Option value="claude-3-7-sonnet-20250219">claude-3-7-sonnet-20250219</Select.Option>
                  <Select.Option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022</Select.Option>
                </Select>

                <span style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: 13, marginLeft: 8 }}>会话控制:</span>
                <Select
                  value={sessionOption}
                  onChange={(val) => setSessionOption(val)}
                  style={{ width: 160 }}
                  size="small"
                >
                  <Select.Option value="resume">沿用最近会话</Select.Option>
                  <Select.Option value="new">开启新会话</Select.Option>
                  {activeTask?.claudeSessionId && (
                    <Select.Option value="resume-selected">继续选中的会话</Select.Option>
                  )}
                </Select>
              </div>

              <TextArea
                rows={3}
                placeholder="在此输入您想要让 Claude 帮您执行的自然语言任务，例如：创建一个 index.html 并写一个炫酷的时钟..."
                value={taskPrompt}
                onChange={(e) => setTaskPrompt(e.target.value)}
                style={{ background: '#090a0f', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 8 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <Switch checked={planMode} onChange={(val) => setPlanMode(val)} />
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>分析模式 (仅做方案不做文件修改)</span>
                </Space>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleStartTask}
                  loading={isStartingTask}
                  className="glow-btn"
                  disabled={!taskPrompt.trim()}
                >
                  发送指令
                </Button>
              </div>
            </div>
          </Col>
        </Row>
      </Drawer>
    </div>
  );
}
