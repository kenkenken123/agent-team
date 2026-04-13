import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Space, Typography, Badge } from 'antd';
import { SaveOutlined, SettingOutlined, RobotOutlined, WechatOutlined } from '@ant-design/icons';
import { getSettings, updateSettings } from '../../api/settingsApi';
import type { SystemSetting } from '../../api/settingsApi';
import './Settings.css';

const { Title, Paragraph } = Typography;

const SettingsPage: React.FC = () => {
    const [settingsForm] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const loadSettings = async () => {
        try {
            const { data } = await getSettings();
            const formValues: Record<string, string> = {};
            data.forEach((s: SystemSetting) => {
                formValues[s.key] = s.value;
            });
            settingsForm.setFieldsValue(formValues);
        } catch (error) {
            console.error(error);
            message.error('加载设置失败');
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const onSaveSettings = async (values: Record<string, string>) => {
        setLoading(true);
        try {
            const settingsToUpdate: SystemSetting[] = Object.keys(values).map(key => ({
                key,
                value: values[key]
            }));
            await updateSettings(settingsToUpdate);
            message.success('设置已保存');
            await loadSettings();
        } catch (error) {
            message.error('保存设置失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="settings-page">
            <Title level={3} style={{ color: '#E6EDF3', fontWeight: 800, marginBottom: 24 }}><SettingOutlined /> 系统设置</Title>
            <Paragraph style={{ color: '#8B949E' }}>
                配置外部信息获取能力与智能路由分发引擎的基础参数。
            </Paragraph>

            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card 
                  title={<span><RobotOutlined style={{ marginRight: 8 }} />LLM 智能路由配置 (AgentTeam)</span>} 
                  bordered={false}
                >
                    <Form
                        form={settingsForm}
                        layout="vertical"
                        onFinish={onSaveSettings}
                    >
                        <Form.Item
                            label="LLM API Base URL"
                            name="router.llm.baseUrl"
                            help="OpenAI 兼容接口地址"
                        >
                            <Input placeholder="https://api.openai.com/v1" />
                        </Form.Item>

                        <Form.Item
                            label="LLM API Key"
                            name="router.llm.apiKey"
                        >
                            <Input.Password placeholder="sk-..." />
                        </Form.Item>

                        <Form.Item
                            label="Model ID"
                            name="router.llm.modelId"
                            help="用于分析路由的轻量级模型 ID"
                        >
                            <Input placeholder="gpt-4o-mini" />
                        </Form.Item>

                        <Form.Item>
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                                保存配置
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>

                <Badge.Ribbon text="第二阶段" color="cyan">
                    <Card 
                      title={<span><WechatOutlined style={{ marginRight: 8, color: '#07C160' }} />企业微信长连接配置</span>} 
                      bordered={false}
                    >
                        <Paragraph type="secondary">
                            基于机器人长连接机制 (WebSocket)，通过 BotID 和 Secret 主动向服务器建立连接，无需公网 IP。
                        </Paragraph>
                        <Form layout="vertical" disabled>
                            <Form.Item label="Bot ID" name="wecom.botId">
                                <Input placeholder="开发者中心获取" />
                            </Form.Item>
                            <Form.Item label="Bot Secret" name="wecom.botSecret">
                                <Input.Password placeholder="开发者中心获取" />
                            </Form.Item>
                        </Form>
                    </Card>
                </Badge.Ribbon>
            </Space>
        </div>
    );
};

export default SettingsPage;
