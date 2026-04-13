import React, { useEffect, useState } from 'react';
import {
    Card, Form, Input, Button, Table, Space,
    Typography, Modal, Select, Switch, message,
    Tag, Divider, Tooltip, Popconfirm, Collapse
} from 'antd';
import { 
    KeyOutlined, 
    PartitionOutlined, 
    PlusOutlined, 
    EditOutlined, 
    DeleteOutlined, 
    SafetyCertificateOutlined,
    RocketOutlined,
    GlobalOutlined
} from '@ant-design/icons';
import { 
    getTemplates, createTemplate, updateTemplate, deleteTemplate,
    getModelConfigs, updateModelConfig, deleteModelConfig,
} from '../../api/configApi';
import type { CredentialTemplate, ModelConfig } from '../../api/configApi';
import './ConfigManager.css';

const { Title, Paragraph, Text } = Typography;

const ConfigManager: React.FC = () => {
    const [templates, setTemplates] = useState<CredentialTemplate[]>([]);
    const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<CredentialTemplate | null>(null);
    const [templateForm] = Form.useForm();
    const [mappingForm] = Form.useForm();

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tRes, mRes] = await Promise.all([getTemplates(), getModelConfigs()]);
            setTemplates(tRes.data);
            setModelConfigs(mRes.data);
        } catch (error) {
            message.error('加载配置失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveTemplate = async (values: any) => {
        try {
            if (editingTemplate) {
                await updateTemplate(editingTemplate.id, values);
                message.success('模板更新成功');
            } else {
                await createTemplate(values);
                message.success('模板创建成功');
            }
            setIsTemplateModalOpen(false);
            setEditingTemplate(null);
            templateForm.resetFields();
            fetchData();
        } catch (error) {
            message.error('操作失败');
        }
    };

    const handleSaveMapping = async (values: any) => {
        try {
            await updateModelConfig(values);
            message.success('映射关系已更新');
            setIsMappingModalOpen(false);
            mappingForm.resetFields();
            fetchData();
        } catch (error) {
            message.error('操作失败');
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        try {
            await deleteTemplate(id);
            message.success('模板已删除');
            fetchData();
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleDeleteMapping = async (id: string) => {
        try {
            await deleteModelConfig(id);
            message.success('映射关系已解除');
            fetchData();
        } catch (error) {
            message.error('删除失败');
        }
    };

    const templateColumns = [
        {
            title: '模板名称',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: CredentialTemplate) => (
                <Space>
                    <Text strong style={{ color: '#E6EDF3' }}>{text}</Text>
                    {record.isDefault && <Tag color="gold">默认</Tag>}
                </Space>
            )
        },
        {
            title: 'API Key',
            dataIndex: 'apiKey',
            key: 'apiKey',
            render: (text: string) => <code style={{ color: '#8B949E', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>••••••••{text.slice(-4)}</code>
        },
        {
            title: 'Base URL',
            dataIndex: 'baseUrl',
            key: 'baseUrl',
            render: (text: string) => <span style={{ color: '#8B949E' }}>{text || '官方接口'}</span>
        },
        {
            title: '操作',
            key: 'action',
            width: 150,
            render: (_: any, record: CredentialTemplate) => (
                <Space>
                    <Button type="text" icon={<EditOutlined />} onClick={() => {
                        setEditingTemplate(record);
                        templateForm.setFieldsValue(record);
                        setIsTemplateModalOpen(true);
                    }} style={{ color: '#58A6FF' }}>编辑</Button>
                    <Popconfirm title="确定删除此模板吗？" onConfirm={() => handleDeleteTemplate(record.id)}>
                        <Button type="text" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const mappingColumns = [
        {
            title: '模型标识 (Model ID)',
            dataIndex: 'modelId',
            key: 'modelId',
            render: (text: string) => <Tag icon={<RocketOutlined />} color="blue" style={{ borderRadius: 6, fontWeight: 600 }}>{text}</Tag>
        },
        {
            title: '关联凭据模板',
            dataIndex: 'template',
            key: 'template',
            render: (template: CredentialTemplate) => (
                <Space>
                    <SafetyCertificateOutlined style={{ color: '#3FB950' }} />
                    <Text style={{ color: '#E6EDF3' }}>{template?.name || '未知模板'}</Text>
                </Space>
            )
        },
        {
            title: '操作',
            key: 'action',
            width: 150,
            render: (_: any, record: ModelConfig) => (
                <Popconfirm title="确定解除此映射吗？" onConfirm={() => record.id && handleDeleteMapping(record.id)}>
                    <Button type="text" danger icon={<DeleteOutlined />}>解除映射</Button>
                </Popconfirm>
            )
        }
    ];

    return (
        <div className="config-page">
            <Title level={3} style={{ color: '#E6EDF3', fontWeight: 800, marginBottom: 8 }}><KeyOutlined /> API 凭据与模型管理</Title>
            <Paragraph style={{ color: '#8B949E', marginBottom: 32 }}>
                通过“模板+映射”机制，为不同的模型配置独立的 API Key 和中转地址。
            </Paragraph>

            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card 
                  className="config-card"
                  title={<span><SafetyCertificateOutlined style={{ marginRight: 8, color: '#58A6FF' }} />凭据模板</span>}
                  extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsTemplateModalOpen(true)} style={{ borderRadius: 8 }}>新增模板</Button>}
                >
                    <Table 
                        className="config-table"
                        dataSource={templates} 
                        columns={templateColumns} 
                        rowKey="id" 
                        loading={loading}
                        pagination={false}
                    />
                </Card>

                <Card 
                  className="config-card"
                  title={<span><PartitionOutlined style={{ marginRight: 8, color: '#A371F7' }} />模型映射</span>}
                  extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsMappingModalOpen(true)} style={{ borderRadius: 8 }}>添加映射</Button>}
                >
                    <Table 
                        className="config-table"
                        dataSource={modelConfigs} 
                        columns={mappingColumns} 
                        rowKey="id" 
                        loading={loading}
                        pagination={false}
                    />
                </Card>
            </Space>

            {/* 模板编辑弹窗 */}
            <Modal
                title={editingTemplate ? "编辑凭据模板" : "新增凭据模板"}
                open={isTemplateModalOpen}
                className="glass-modal"
                onCancel={() => { setIsTemplateModalOpen(false); setEditingTemplate(null); templateForm.resetFields(); }}
                onOk={() => templateForm.submit()}
                destroyOnClose
            >
                <Form form={templateForm} layout="vertical" onFinish={handleSaveTemplate}>
                    <Form.Item name="name" label={<span style={{color: '#8B949E'}}>模板名称</span>} rules={[{ required: true }]}>
                        <Input placeholder="例如：我的主账户" className="glass-input" style={{background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#E6EDF3'}} />
                    </Form.Item>
                    <Form.Item name="apiKey" label={<span style={{color: '#8B949E'}}>API Key</span>} rules={[{ required: true }]}>
                        <Input.Password placeholder="sk-ant-..." className="glass-input" style={{background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#E6EDF3'}} />
                    </Form.Item>
                    <Form.Item name="baseUrl" label={<span style={{color: '#8B949E'}}>API Base URL (可选)</span>}>
                        <Input prefix={<GlobalOutlined />} placeholder="https://api.anthropic.com" className="glass-input" style={{background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#E6EDF3'}} />
                    </Form.Item>
                    <Form.Item name="isDefault" label={<span style={{color: '#8B949E'}}>设为默认模板</span>} valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            {/* 映射编辑弹窗 */}
            <Modal
                title="添加模型映射"
                open={isMappingModalOpen}
                className="glass-modal"
                onCancel={() => { setIsMappingModalOpen(false); mappingForm.resetFields(); }}
                onOk={() => mappingForm.submit()}
                destroyOnClose
            >
                <Form form={mappingForm} layout="vertical" onFinish={handleSaveMapping}>
                    <Form.Item name="modelId" label={<span style={{color: '#8B949E'}}>模型 ID (Model ID)</span>} rules={[{ required: true }]}>
                        <Input placeholder="例如：claude-3-5-sonnet-latest" style={{background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#E6EDF3'}} />
                    </Form.Item>
                    <Form.Item name="templateId" label={<span style={{color: '#8B949E'}}>关联凭据模板</span>} rules={[{ required: true }]}>
                        <Select placeholder="选择一个凭据模板" dropdownStyle={{background: '#161B22', border: '1px solid #30363D'}}>
                            {templates.map(t => (
                                <Select.Option key={t.id} value={t.id}>{t.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ConfigManager;
