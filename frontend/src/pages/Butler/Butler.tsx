import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Space, Divider, Typography, Tag, List, Badge, Empty } from 'antd';
import { SendOutlined, MessageOutlined, CustomerServiceOutlined, HistoryOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { ingestMessage, getMessages } from '../../api/messageApi';
import type { IncomingMessage, PagedIncomingMessages } from '../../api/messageApi';
import './Butler.css';

const { Title, Text, Paragraph } = Typography;

const ButlerPage: React.FC = () => {
    const [msgForm] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [messages, setMessages] = useState<IncomingMessage[]>([]);
    const [routingResult, setRoutingResult] = useState<IncomingMessage | null>(null);

    const loadMessages = async () => {
        try {
            const { data } = await getMessages(0, 10);
            setMessages(data.items);
        } catch (error) {
            console.error('加载消息历史失败', error);
        }
    };

    useEffect(() => {
        loadMessages();
    }, []);

    const onSendToButler = async (values: { text: string }) => {
        setLoading(true);
        try {
            const { data } = await ingestMessage(values.text);
            setRoutingResult(data);
            message.success('您的指令已送达，管家正在处理...');
            msgForm.resetFields();
            loadMessages();
        } catch (error) {
            message.error('发送指令失败，请检查后端连接');
        } finally {
            setLoading(false);
        }
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
                我是您的智能管家。您可以直接下达任务，我会自动识别并分发给最合适的 Agent 去执行。
            </Paragraph>

            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* 指令发送区 */}
                <Card bordered={false} className="butler-input-card">
                    <Form form={msgForm} layout="vertical" onFinish={onSendToButler}>
                        <Form.Item
                            name="text"
                            rules={[{ required: true, message: '请输入您的指令' }]}
                        >
                            <Input.TextArea 
                                rows={4} 
                                placeholder="请输入您的指令。例如：'帮我分析一下 backend 目录下的代码结构' 或 '帮我写一个 React 登录页面'"
                                style={{ borderRadius: 8, fontSize: '16px', padding: '12px' }}
                            />
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
                                                <Button type="primary" size="middle" ghost style={{ borderRadius: 6 }}>去监控任务进度</Button>
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
                                extra={getStatusTag(item.status)}
                                style={{ borderBottom: '1px solid #30363D', padding: '20px 0' }}
                            >
                                <List.Item.Meta
                                    title={
                                        <Text style={{ color: '#8B949E', fontSize: 12 }}>
                                            {new Date(item.createdAt).toLocaleString()} 来自 WebPage
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
