import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Space, Divider, Typography, Tag, List, Badge, Empty, Select, Upload, Switch, Tooltip } from 'antd';
import { 
    SendOutlined, 
    CustomerServiceOutlined, 
    HistoryOutlined, 
    CheckCircleOutlined, 
    ExclamationCircleOutlined, 
    RobotOutlined,
    UploadOutlined,
    ArrowRightOutlined
} from '@ant-design/icons';
import { ingestMessage, getMessages } from '../../api/messageApi';
import { agentApi } from '../../api/agentApi';
import type { IncomingMessage } from '../../api/messageApi';
import type { Agent } from '../../types';
import { useAppStore } from '../../stores/appStore';
import './Butler.css';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const ButlerPage: React.FC = () => {
    const [msgForm] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [messages, setMessages] = useState<IncomingMessage[]>([]);
    const [routingResult, setRoutingResult] = useState<IncomingMessage | null>(null);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [fileList, setFileList] = useState<any[]>([]);
    
    // Add state to track selected agent for purple placeholder text
    const [selectedAgentId, setLocalSelectedAgentId] = useState<string | undefined>(undefined);
    
    const { setPage, setSelectedAgentId } = useAppStore();

    const loadMessages = async () => {
        try {
            const { data } = await getMessages(0, 10);
            setMessages(data.items);
        } catch (error) {
            console.error('加载消息历史失败', error);
        }
    };

    const loadAgents = async () => {
        try {
            const data = await agentApi.getAll();
            setAgents(data);
        } catch (error) {
            console.error('加载 Agent 列表失败', error);
        }
    };

    useEffect(() => {
        loadMessages();
        loadAgents();
    }, []);

    const onSendToButler = async (values: { text: string; agentId?: string; optimizePrompt?: boolean }) => {
        setLoading(true);
        try {
            // 获取已上传成功的图片 URL
            const imageUrls = fileList
                .filter(file => file.status === 'done' && file.response?.url)
                .map(file => file.response.url);

            const { data } = await ingestMessage(values.text, values.agentId, imageUrls, values.optimizePrompt);
            setRoutingResult(data);
            message.success('您的指令已送达，管家正在处理...');
            msgForm.resetFields(['text']); // 仅重置文本，保留 Agent 选择和优化选项
            setFileList([]);
            loadMessages();
        } catch (error) {
            message.error('发送指令失败，请检查后端连接');
        } finally {
            setLoading(false);
        }
    };

    const goToConsole = (agentId?: string, taskId?: string) => {
        if (agentId) setSelectedAgentId(agentId);
        // 如果需要跳转到特定任务，目前的 Console 可能需要扩展支持 taskId 参数
        // 这里暂时先跳转到控制台页面
        setPage('console');
    };

    const getStatusTag = (status: string) => {
        switch (status) {
            case 'Routed': return <Tag color="success" icon={<CheckCircleOutlined />}>已分发任务</Tag>;
            case 'NoAgent': return <Tag color="warning" icon={<ExclamationCircleOutlined />}>无匹配 Agent</Tag>;
            case 'Failed': return <Tag color="error" icon={<ExclamationCircleOutlined />}>执行失败</Tag>;
            default: return <Tag>{status}</Tag>;
        }
    };

    return (
        <div className="butler-page">
            <Typography style={{ textAlign: 'center', marginBottom: 32 }}>
                <Title level={3} style={{ color: '#f0f6fc', margin: 0 }}>
                    <CustomerServiceOutlined style={{ marginRight: 8, color: '#8b5cf6' }} /> 
                    Agent 管家
                </Title>
                <div style={{ color: '#8b949e', marginTop: 8, fontSize: 13 }}>
                    我是您的智能管家。您可以直接下达任务，我会自动识别分发，或由您指定专属 Agent 处理。
                </div>
            </Typography>

            <Space direction="vertical" size={24} style={{ width: '100%' }}>
                {/* 第一层：操作区 */}
                <Card bordered={false} className="butler-input-card">
                    <div className={`input-section-transition ${loading ? 'input-faded' : ''}`}>
                        <Form 
                            form={msgForm} 
                            layout="vertical" 
                            onFinish={onSendToButler}
                            initialValues={{ agentId: undefined, optimizePrompt: false }}
                            onValuesChange={(changedValues) => {
                                if ('agentId' in changedValues) {
                                    setLocalSelectedAgentId(changedValues.agentId);
                                }
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, gap: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                                    <Form.Item name="agentId" style={{ marginBottom: 0, flex: 1 }}>
                                        <Select 
                                            placeholder="✨ 自动识别 (智能路由)" 
                                            allowClear 
                                            className={!selectedAgentId ? 'select-auto-identify' : ''}
                                            style={{ width: '100%' }}
                                            size="large"
                                            dropdownStyle={{ background: '#161b22', border: '1px solid #30363d' }}
                                        >
                                            {agents.map(agent => (
                                                <Option key={agent.id} value={agent.id}>
                                                    <RobotOutlined style={{ marginRight: 8, color: '#58a6ff' }} />
                                                    {agent.name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </div>
                                
                                <div className="optimize-toggle-wrapper">
                                    <Tooltip title="启用后，管家会使用高级 AI 对您的指令进行优化和补全">
                                        <Text className="optimize-text">✨ 优化指令</Text>
                                    </Tooltip>
                                    <Form.Item name="optimizePrompt" valuePropName="checked" style={{ marginBottom: 0 }}>
                                        <Switch size="small" className="optimize-switch" />
                                    </Form.Item>
                                </div>
                            </div>

                        <Form.Item
                            name="text"
                            rules={[{ required: true, message: '请输入您的指令' }]}
                            style={{ marginBottom: 32 }}
                        >
                            <Input.TextArea 
                                className="butler-textarea"
                                placeholder="指派说明或任何需求，例如：'帮我分析一下 backend 目录下的代码结构' 或 '帮我写一个 React 登录页面'"
                                onPaste={async (e) => {
                                    const items = e.clipboardData.items;
                                    for (let i = 0; i < items.length; i++) {
                                        if (items[i].type.indexOf('image') !== -1) {
                                            const file = items[i].getAsFile();
                                            if (file) {
                                                if (fileList.length >= 3) {
                                                    message.warning('最多只能上传 3 张图片');
                                                    return;
                                                }
                                                message.loading({ content: '正在上传...', key: 'paste-upload' });
                                                const formData = new FormData();
                                                formData.append('file', file);
                                                try {
                                                    const response = await fetch('http://localhost:5501/api/Upload', {
                                                        method: 'POST', body: formData
                                                    });
                                                    const data = await response.json();
                                                    if (data && data.url) {
                                                        message.success({ content: '已添加附件', key: 'paste-upload' });
                                                        const newFile: any = {
                                                            uid: `paste-${Date.now()}`,
                                                            name: 'pasted-' + (file.name || 'image.png'),
                                                            status: 'done',
                                                            url: data.url,
                                                            thumbUrl: data.url,
                                                            response: data
                                                        };
                                                        setFileList(prev => {
                                                            if (prev.length >= 3) return prev;
                                                            return [...prev, newFile];
                                                        });
                                                    }
                                                } catch (err) {
                                                    message.error({ content: '粘贴上传失败', key: 'paste-upload' });
                                                }
                                            }
                                        }
                                    }
                                }}
                            />
                        </Form.Item>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Form.Item style={{ marginBottom: 0 }}>
                                <Upload
                                    action="http://localhost:5501/api/Upload"
                                    listType="picture-card"
                                    fileList={fileList}
                                    onChange={({ fileList: fl }) => setFileList(fl)}
                                    className="butler-uploader"
                                    name="file"
                                >
                                    {fileList.length < 3 && (
                                        <div className="upload-btn-content">
                                            <UploadOutlined style={{ fontSize: 20, color: '#8b949e' }} />
                                            <div style={{ marginTop: 8, color: '#8b949e', fontSize: 12 }}>附图</div>
                                        </div>
                                    )}
                                </Upload>
                            </Form.Item>

                            <Form.Item style={{ marginBottom: 0 }}>
                                <Button 
                                    type="primary" 
                                    htmlType="submit" 
                                    className="butler-send-btn"
                                    icon={<SendOutlined />} 
                                    loading={loading}
                                >
                                    发送指令
                                </Button>
                            </Form.Item>
                        </div>
                    </Form>
                    </div>

                    {routingResult && (
                        <div className="routing-result-box" style={{ marginTop: 24 }}>
                            <Badge.Ribbon text="分析结果" color={routingResult.status === 'Routed' ? '#238636' : '#d29922'}>
                                <div style={{ padding: '20px', background: '#1C2128', borderRadius: 12, border: '1px solid #30363D' }}>
                                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                        <div>
                                            <Text strong style={{ fontSize: 16 }}>处理状态：</Text> {getStatusTag(routingResult.status)}
                                        </div>
                                        <div style={{ padding: '12px', background: '#0D1117', borderRadius: 8, borderLeft: '4px solid #30363D' }}>
                                            <Text type="secondary" italic>"{routingResult.routerReason || '管家正在思考...'}"</Text>
                                        </div>
                                        {routingResult.triggeredAgentId && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <RobotOutlined style={{ color: '#58a6ff' }} />
                                                <Text strong>已指派 Agent：</Text> 
                                                <Tag color="processing" style={{ margin: 0 }}>{routingResult.triggeredAgentId}</Tag>
                                            </div>
                                        )}
                                        {routingResult.triggeredTaskId && (
                                            <div style={{ marginTop: 8 }}>
                                                <Button 
                                                    type="primary" 
                                                    size="middle" 
                                                    ghost 
                                                    style={{ borderRadius: 6 }}
                                                    onClick={() => goToConsole(routingResult.triggeredAgentId, routingResult.triggeredTaskId)}
                                                    icon={<ArrowRightOutlined />}
                                                >
                                                    去监控任务进度
                                                </Button>
                                            </div>
                                        )}
                                    </Space>
                                </div>
                            </Badge.Ribbon>
                        </div>
                    )}
                </Card>

                {/* 第二层：历史记录流水区 */}
                <Card 
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c9d1d9' }}>
                        <HistoryOutlined style={{ color: '#8b949e' }} />
                        <span>历史流水</span>
                    </div>
                  } 
                  bordered={false}
                  className="history-stream-card"
                >
                    <List
                        className="msg-history-list"
                        dataSource={messages}
                        locale={{ 
                            emptyText: (
                                <Empty 
                                    image={<HistoryOutlined style={{ fontSize: 48, color: '#30363d' }} />}
                                    description={<span style={{ color: '#8b949e' }}>时光静好，暂无历史</span>}
                                />
                            ) 
                        }}
                        renderItem={(item: IncomingMessage) => (
                            <List.Item
                                key={item.id}
                                className="history-stream-item"
                            >
                                <div className="stream-item-content">
                                    <div className="stream-header">
                                        <div className="stream-time">
                                            {new Date(item.createdAt).toLocaleString()}
                                        </div>
                                        <div className="stream-right-meta">
                                            <Tag color="#21262d" style={{ color: '#8b949e', border: '1px solid #30363d' }}>
                                                {item.source || 'Web'}
                                            </Tag>
                                            <span style={{ fontSize: 12, color: '#6e7681' }}>#{item.id.substring(0,6)}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="stream-body">
                                        <div className="stream-text">
                                            {item.parsedText}
                                        </div>
                                        {item.routerReason && (
                                            <div className="stream-feedback">
                                                {item.routerReason}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="stream-footer">
                                        <div className="stream-status">
                                            {getStatusTag(item.status)}
                                        </div>
                                        {item.triggeredTaskId && (
                                            <div className="stream-action">
                                                <Button 
                                                    className="ghost-action-btn"
                                                    onClick={() => goToConsole(item.triggeredAgentId, item.triggeredTaskId)}
                                                >
                                                    查看任务 <ArrowRightOutlined />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </List.Item>
                        )}
                    />
                </Card>
            </Space>
        </div>
    );
};

export default ButlerPage;
