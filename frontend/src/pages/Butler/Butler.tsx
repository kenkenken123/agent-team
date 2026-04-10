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
            <Title level={3}><CustomerServiceOutlined /> Agent 管家</Title>
            <Paragraph style={{ color: '#8B949E' }}>
                我是您的智能管家。您可以直接下达任务，我会自动识别并分发给最合适的 Agent 去执行。也可以直接指派指定 Agent 处理。
            </Paragraph>

            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* 指令发送区 */}
                <Card bordered={false} className="butler-input-card">
                    <Form 
                        form={msgForm} 
                        layout="vertical" 
                        onFinish={onSendToButler}
                        initialValues={{ agentId: undefined, optimizePrompt: false }}
                    >
                        <Space style={{ width: '100%', marginBottom: 16, justifyContent: 'space-between' }} align="center">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                                <Text strong style={{ color: '#F0F6FC', whiteSpace: 'nowrap' }}>处理者 (Agent):</Text>
                                <Form.Item name="agentId" style={{ marginBottom: 0, flex: 1 }}>
                                    <Select 
                                        placeholder="自动识别 (智能路由)" 
                                        allowClear 
                                        style={{ width: '100%' }}
                                        size="large"
                                    >
                                        {agents.map(agent => (
                                            <Option key={agent.id} value={agent.id}>
                                                <RobotOutlined style={{ marginRight: 8 }} />
                                                {agent.name}
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(137, 87, 229, 0.1)', padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(137, 87, 229, 0.2)' }}>
                                <Tooltip title="启用后，管家会使用高级 AI 对您的指令进行优化和补全，以获得更精准的执行效果">
                                    <Text style={{ color: '#bc8cff', fontSize: 13, fontWeight: 500, cursor: 'help' }}>✨ 优化指令</Text>
                                </Tooltip>
                                <Form.Item name="optimizePrompt" valuePropName="checked" style={{ marginBottom: 0 }}>
                                    <Switch size="small" />
                                </Form.Item>
                            </div>
                        </Space>

                        <Form.Item
                            name="text"
                            rules={[{ required: true, message: '请输入您的指令' }]}
                        >
                            <Input.TextArea 
                                rows={4} 
                                placeholder="请输入您的指令。例如：'帮我分析一下 backend 目录下的代码结构' 或 '帮我写一个 React 登录页面'"
                                style={{ borderRadius: 8, fontSize: '16px', padding: '12px' }}
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
                                                message.loading({ content: '正在上传粘贴的图片...', key: 'paste-upload' });
                                                const formData = new FormData();
                                                formData.append('file', file);
                                                try {
                                                    const response = await fetch('http://localhost:5501/api/Upload', {
                                                        method: 'POST', body: formData
                                                    });
                                                    const data = await response.json();
                                                    if (data && data.url) {
                                                        message.success({ content: '图片已成功添加至附件', key: 'paste-upload' });
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

                        <Form.Item label="附件图片" style={{ marginBottom: 24 }}>
                            <Upload
                                action="http://localhost:5501/api/Upload"
                                listType="picture-card"
                                fileList={fileList}
                                onChange={({ fileList: fl }) => setFileList(fl)}
                                className="butler-uploader"
                                name="file" // 与后端接收名一致
                            >
                                {fileList.length < 3 && (
                                    <div>
                                        <UploadOutlined />
                                        <div style={{ marginTop: 8 }}>上传</div>
                                    </div>
                                )}
                            </Upload>
                            <Text type="secondary" style={{ fontSize: 12 }}>提示：上传的图片将作为指令上下文供 Agent 参考（支持截图分析）</Text>
                        </Form.Item>

                        <Form.Item style={{ marginBottom: 0 }}>
                            <Button 
                                type="primary" 
                                htmlType="submit" 
                                icon={<SendOutlined />} 
                                loading={loading}
                                size="large"
                                style={{ height: '48px', padding: '0 32px', borderRadius: '24px' }}
                            >
                                发送指令
                            </Button>
                        </Form.Item>
                    </Form>

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

                {/* 历史记录区 */}
                <Card 
                  title={<span><HistoryOutlined style={{ marginRight: 8 }} />指令记录流水</span>} 
                  bordered={false}
                >
                    <List
                        className="msg-history-list"
                        itemLayout="vertical"
                        dataSource={messages}
                        locale={{ emptyText: <Empty description="暂无指令记录" /> }}
                        renderItem={(item: IncomingMessage) => (
                            <List.Item
                                key={item.id}
                                extra={
                                    <Space direction="vertical" align="end">
                                        {getStatusTag(item.status)}
                                        {item.triggeredTaskId && (
                                            <Button 
                                                type="link" 
                                                size="small" 
                                                onClick={() => goToConsole(item.triggeredAgentId, item.triggeredTaskId)}
                                                icon={<ArrowRightOutlined />}
                                            >
                                                查看任务
                                            </Button>
                                        )}
                                    </Space>
                                }
                                style={{ borderBottom: '1px solid #30363D', padding: '20px 0' }}
                            >
                                <List.Item.Meta
                                    title={
                                        <Text style={{ color: '#8B949E', fontSize: 12 }}>
                                            {new Date(item.createdAt).toLocaleString()} 来自 {item.source}
                                        </Text>
                                    }
                                    description={
                                        <div style={{ marginTop: 8 }}>
                                            <Paragraph style={{ color: '#C9D1D9', fontSize: 15, marginBottom: 8 }}>
                                                {item.parsedText}
                                            </Paragraph>
                                            {item.routerReason && (
                                                <div style={{ color: '#8B949E', fontSize: 13, background: '#161B22', padding: '8px 12px', borderRadius: 6 }}>
                                                    反馈：{item.routerReason}
                                                </div>
                                            )}
                                        </div>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                </Card>
            </Space>
        </div>
    );
};

export default ButlerPage;
