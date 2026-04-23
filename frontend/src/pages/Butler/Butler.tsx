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
import { useTaskWebSocket } from '../../hooks/useTaskWebSocket';
import { taskApi } from '../../api/taskApi';
import './Butler.css';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

/**
 * 安全解析 JSON，避免组件因格式错误而崩溃
 */
function safeParseJson(text: string | undefined | null): any | null {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (e) {
        console.warn('JSON.parse 失败，返回 null:', e);
        return null;
    }
}

const SummarySnapshot: React.FC<{ taskId: string }> = ({ taskId }) => {
    const [summary, setSummary] = useState<any>(null);
    const [fallbackText, setFallbackText] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const task = await taskApi.getById(taskId);
                if (task.butlerSummary) {
                    const parsed = safeParseJson(task.butlerSummary);
                    if (parsed) {
                        setSummary(parsed);
                    }
                }
                // 兜底：如果 butlerSummary 为空（LLM 调用失败），使用 finalResult
                if (!summary && task.finalResult) {
                    setFallbackText(task.finalResult);
                }
            } catch (e) {
                console.error('加载历史总结失败', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [taskId]);

    if (loading) return <div style={{ fontSize: 12, color: '#8b949e', marginTop: 8 }}>📊 正在加载任务总结...</div>;

    if (summary) {
        return (
            <div className="summary-snapshot">
                <div className="snapshot-tag">总结</div>
                <div className="snapshot-text">{summary.summary}</div>
            </div>
        );
    }

    if (fallbackText) {
        const truncated = fallbackText.length > 200 ? fallbackText.substring(0, 200) + '...' : fallbackText;
        return (
            <div className="summary-snapshot">
                <div className="snapshot-tag">结果</div>
                <div className="snapshot-text">{truncated}</div>
            </div>
        );
    }

    return null;
};

const ButlerPage: React.FC = () => {
    const [msgForm] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [messages, setMessages] = useState<IncomingMessage[]>([]);
    const [routingResult, setRoutingResult] = useState<IncomingMessage | null>(null);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [fileList, setFileList] = useState<any[]>([]);
    
    // Phase Management
    const [phase, setPhaseState] = useState<'idle' | 'analyzing' | 'waiting' | 'summarizing' | 'done'>('idle');
    const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
    const [summaryData, setSummaryData] = useState<any>(null);
    const pollingTaskIdRef = React.useRef<string | null>(null);
    const pollingIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
    const messagesEndRef = React.useRef<HTMLDivElement>(null);
    
    const { setPage, setSelectedAgentId, setSelectedSessionId } = useAppStore();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, phase, summaryData, routingResult]);

    const loadMessages = async () => {
        try {
            const { data } = await getMessages(0, 20);
            setMessages(data.items.reverse()); // 聊天记录通常按时间正序排列
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

    /** 清除正在进行的轮询 */
    const clearPolling = () => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        pollingTaskIdRef.current = null;
    };

    // 组件卸载时清理轮询
    useEffect(() => {
        return () => {
            clearPolling();
        };
    }, []);

    const pollSummary = async (taskId: string) => {
        if (pollingTaskIdRef.current === taskId) return;
        pollingTaskIdRef.current = taskId;

        let attempts = 0;
        const maxAttempts = 30;

        const check = async (): Promise<boolean> => {
            try {
                const task = await taskApi.getById(taskId);
                if (task.butlerSummary) {
                    const parsed = safeParseJson(task.butlerSummary);
                    setSummaryData(parsed || { summary: task.butlerSummary });
                    setPhaseState('done');
                    loadMessages();
                    return true;
                }
                // 即使没有 butlerSummary，如果任务已完成也展示兜底内容
                if (task.status === 'Completed') {
                    setPhaseState('done');
                    loadMessages();
                    return true;
                }
            } catch (error) {
                console.error('轮询总结失败', error);
            }
            return false;
        };

        // 清除旧的轮询（防止重复启动）
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
        }

        pollingIntervalRef.current = setInterval(async () => {
            attempts++;
            const success = await check();
            if (success || attempts >= maxAttempts) {
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                }
                pollingTaskIdRef.current = null;
                // 超时后仍然没有总结，也要标记 done 让 UI 展示兜底
                if (!success) {
                    setPhaseState('done');
                }
            }
        }, 1000);
    };

    const onSendToButler = async (values: { text: string; agentId?: string; optimizePrompt?: boolean }) => {
        if (!values.text?.trim() && fileList.length === 0) return;

        setLoading(true);
        clearPolling();
        setPhaseState('analyzing');
        setRoutingResult(null);
        setSummaryData(null);
        setCurrentTaskId(null);

        try {
            const imageUrls = fileList
                .filter(file => file.status === 'done' && file.response?.url)
                .map(file => file.response.url);

            const { data } = await ingestMessage(values.text, values.agentId, imageUrls, values.optimizePrompt);
            setRoutingResult(data);
            
            if (data.status === 'Routed' && data.triggeredTaskId) {
                setCurrentTaskId(data.triggeredTaskId);
                setPhaseState('waiting');
            } else if (data.status === 'NoAgent') {
                setPhaseState('idle');
                message.warning('管家未找到合适 Agent，已记录为待澄清状态。');
            } else {
                setPhaseState('idle');
            }

            msgForm.resetFields(['text']);
            setFileList([]);
            loadMessages();
        } catch (error) {
            message.error('发送指令失败，请检查后端连接');
            setPhaseState('idle');
        } finally {
            setLoading(false);
        }
    };

    // WebSocket Listener
    useTaskWebSocket(currentTaskId, {
        onMessage: (msg) => {
            if (msg.type === 'status') {
                if (msg.status === 'Completed') {
                    setPhaseState('summarizing');
                    pollSummary(currentTaskId!);
                } else if (msg.status === 'Failed' || msg.status === 'Cancelled') {
                    clearPolling();
                    setPhaseState('idle');
                }
            } else if (msg.type === 'summary_ready') {
                // WebSocket 收到总结：清除轮询，更新 UI
                clearPolling();
                try {
                    const parsed = typeof msg.summary === 'string' ? safeParseJson(msg.summary) : msg.summary;
                    if (parsed) {
                        setSummaryData(parsed);
                        setPhaseState('done');
                        loadMessages();
                    } else {
                        // LLM 返回了空/无效 JSON，仍然标记为 done，由 UI 层兜底展示
                        setPhaseState('done');
                    }
                } catch (e) {
                    console.error('解析 WebSocket 总结失败', e);
                    setPhaseState('done');
                }
            } else if (msg.type === 'task_completed') {
                // 兜底事件：LLM 总结失败时广播，告知前端任务已完成但无结构化总结
                clearPolling();
                setSummaryData(null);
                setPhaseState('done');
                loadMessages();
            }
        }
    });

    const goToConsole = (agentId?: string, taskId?: string) => {
        if (agentId) setSelectedAgentId(agentId);
        if (taskId) setSelectedSessionId(taskId);
        setPage('console');
    };

    const handleSuggestionClick = (text: string) => {
        msgForm.setFieldsValue({ text });
        const inputEl = document.getElementById('butler-input-area');
        inputEl?.focus();
    };

    const getStatusTag = (status: string) => {
        switch (status) {
            case 'Routed': return <Tag color="success" icon={<CheckCircleOutlined />}>已路由</Tag>;
            case 'NoAgent': return <Tag color="warning" icon={<ExclamationCircleOutlined />}>待处理</Tag>;
            case 'Failed': return <Tag color="error" icon={<ExclamationCircleOutlined />}>失败</Tag>;
            case 'Completed': return <Tag color="processing" icon={<CheckCircleOutlined />}>完成</Tag>;
            default: return <Tag>{status}</Tag>;
        }
    };

    const getAgentDisplayName = (msg: any) => {
        if (msg.triggeredAgentName) return msg.triggeredAgentName;
        if (msg.triggeredAgentId) {
            const agent = agents.find(a => a.id === msg.triggeredAgentId);
            return agent ? agent.name : msg.triggeredAgentId;
        }
        return null;
    };

    return (
        <div className="butler-chat-container">
            {/* 消息滚动区 */}
            <div className="chat-messages-stream">
                {/* 欢迎语 */}
                <div className="chat-system-notice">
                    <div className="notice-inner">
                        <Title level={5} style={{ color: '#8b5cf6', margin: 0 }}>
                            <RobotOutlined style={{ marginRight: 8 }} /> Agent 管家
                        </Title>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            我是您的智能管家。您可以直接下达任务，我会自动分发或由您指定 Agent 处理。
                        </Text>
                    </div>
                </div>

                {/* 消息历史 */}
                {messages.map((msg) => {
                    const agentName = getAgentDisplayName(msg);
                    return (
                        <div key={msg.id} className="chat-message-group">
                            <div className="chat-row user-row">
                                <div className="bubble user-bubble">
                                    <div className="bubble-content">{msg.parsedText}</div>
                                    {msg.imageUrls && typeof msg.imageUrls === 'string' && (
                                        <div className="bubble-images">
                                            {msg.imageUrls.split(';').filter(Boolean).map((url, i) => (
                                                <img key={i} src={url} alt="upload" className="msg-img" />
                                            ))}
                                        </div>
                                    )}
                                    <div className="bubble-meta">{new Date(msg.createdAt).toLocaleTimeString()}</div>
                                </div>
                            </div>

                            <div className="chat-row butler-row">
                                <div className="chat-avatar"><RobotOutlined /></div>
                                <div 
                                    className={`bubble butler-bubble ${msg.triggeredTaskId ? 'clickable' : ''}`}
                                    onClick={() => msg.triggeredTaskId && goToConsole(msg.triggeredAgentId, msg.triggeredTaskId)}
                                >
                                    <div className="butler-header">
                                        {getStatusTag(msg.status)}
                                        {agentName && (
                                            <Tag 
                                                color="blue" 
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {agentName}
                                            </Tag>
                                        )}
                                    </div>
                                    <div className="butler-reason">{msg.routerReason || "指令处理完成"}</div>
                                    
                                    {msg.triggeredTaskId && msg.status === 'Completed' && (
                                        <div className="butler-result-snapshot">
                                            <SummarySnapshot taskId={msg.triggeredTaskId} />
                                            <Button 
                                                type="link" 
                                                size="small" 
                                                onClick={() => goToConsole(msg.triggeredAgentId, msg.triggeredTaskId)}
                                                style={{ padding: '4px 0', height: 'auto' }}
                                            >
                                                查看任务详情 <ArrowRightOutlined style={{ fontSize: 10 }} />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* 当前活动任务气泡 */}
                {phase !== 'idle' && (
                    <div className="chat-message-group live-task">
                        <div className="chat-row butler-row">
                            <div className="chat-avatar pulse"><RobotOutlined /></div>
                            <div 
                                className={`bubble butler-bubble live ${routingResult?.triggeredTaskId ? 'clickable' : ''}`}
                                onClick={() => routingResult?.triggeredTaskId && goToConsole(routingResult?.triggeredAgentId, routingResult?.triggeredTaskId)}
                            >
                                <div className="butler-header" style={{ marginBottom: 12 }}>
                                    {getStatusTag(routingResult?.status || 'Processing')}
                                    {getAgentDisplayName(routingResult) && (
                                        <Tag 
                                            color="blue" 
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {getAgentDisplayName(routingResult)}
                                        </Tag>
                                    )}
                                </div>
                                <div className="live-status-steps">
                                    <span className={`step ${phase === 'analyzing' ? 'active' : 'done'}`}>分析</span>
                                    <span className="dot">·</span>
                                    <span className={`step ${phase === 'waiting' ? 'active' : (phase==='summarizing'||phase==='done') ? 'done' : ''}`}>执行</span>
                                    <span className="dot">·</span>
                                    <span className={`step ${phase === 'summarizing' ? 'active' : phase === 'done' ? 'done' : ''}`}>总结</span>
                                </div>
                                
                                {routingResult && (
                                    <div className="live-routing-reason">
                                        {routingResult.routerReason || "管家思考中..."}
                                    </div>
                                )}

                                {phase === 'done' && summaryData && (
                                    <div className="live-summary-box">
                                        <div className="summary-text">{summaryData.summary}</div>
                                        {summaryData.suggestedNextActions && (
                                            <div className="chat-suggestions-list">
                                                {summaryData.suggestedNextActions.map((s: string, idx: number) => (
                                                    <div key={idx} className="chat-suggestion-chip" onClick={() => handleSuggestionClick(s)}>
                                                        {s}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <Button
                                            type="primary"
                                            size="small"
                                            onClick={() => setPhaseState('idle')}
                                            style={{ marginTop: 12, borderRadius: 4 }}
                                        >
                                            开启新任务
                                        </Button>
                                    </div>
                                )}

                                {phase === 'done' && !summaryData && routingResult?.triggeredTaskId && (
                                    <div className="live-summary-box">
                                        <div className="summary-text" style={{ color: '#8b949e' }}>
                                            任务已完成。结构化总结生成中或暂不可用，请查看任务详情。
                                        </div>
                                        <Button
                                            type="link"
                                            size="small"
                                            onClick={() => goToConsole(routingResult?.triggeredAgentId, routingResult?.triggeredTaskId)}
                                            style={{ marginTop: 8, padding: 0, height: 'auto' }}
                                        >
                                            查看任务详情 <ArrowRightOutlined style={{ fontSize: 10 }} />
                                        </Button>
                                        <Button
                                            type="primary"
                                            size="small"
                                            onClick={() => setPhaseState('idle')}
                                            style={{ marginTop: 8, borderRadius: 4 }}
                                        >
                                            开启新任务
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} style={{ height: 1 }} />
            </div>

            {/* 底部固定工具栏 */}
            <div className="chat-bottom-bar">
                <Form form={msgForm} onFinish={onSendToButler} className="chat-input-form">
                    <div className="input-toolbar-top">
                        <Space size="middle">
                            <Form.Item name="agentId" noStyle>
                                <Select 
                                    placeholder="✨ 自动路由" 
                                    allowClear 
                                    style={{ width: 140 }}
                                    className="chat-agent-select"
                                    popupClassName="chat-agent-popup"
                                >
                                    {agents.map(a => <Option key={a.id} value={a.id}>{a.name}</Option>)}
                                </Select>
                            </Form.Item>
                            <Form.Item name="optimizePrompt" valuePropName="checked" noStyle>
                                <div className="chat-optimize-switch">
                                    <Switch size="small" />
                                    <Text className="switch-text">✨ 优化指令</Text>
                                </div>
                            </Form.Item>
                        </Space>
                    </div>

                    <div className="input-main-row">
                        <Form.Item name="text" noStyle>
                            <Input.TextArea 
                                id="butler-input-area"
                                placeholder="输入您的指令，Shift + Enter 换行"
                                autoSize={{ minRows: 1, maxRows: 5 }}
                                className="chat-textarea-input"
                                onPressEnter={(e) => {
                                    if (!e.shiftKey) {
                                        e.preventDefault();
                                        msgForm.submit();
                                    }
                                }}
                            />
                        </Form.Item>
                        
                        <div className="input-action-buttons">
                            <Upload
                                action="http://localhost:5501/api/Upload"
                                fileList={fileList}
                                onChange={({ fileList: fl }) => setFileList(fl)}
                                showUploadList={false}
                                multiple
                            >
                                <Button icon={<UploadOutlined />} className="icon-btn" />
                            </Upload>
                            <Button 
                                type="primary" 
                                htmlType="submit" 
                                icon={<SendOutlined />} 
                                loading={loading}
                                className="send-btn"
                            />
                        </div>
                    </div>

                    {fileList.length > 0 && (
                        <div className="input-attachment-list">
                            {fileList.map((f, i) => (
                                <Tag key={i} closable onClose={() => setFileList(fileList.filter((_, idx) => idx !== i))}>
                                    图片 {i+1}
                                </Tag>
                            ))}
                        </div>
                    )}
                </Form>
            </div>
        </div>
    );
};

export default ButlerPage;
