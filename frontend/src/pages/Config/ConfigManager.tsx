import React, { useEffect, useState } from 'react';
import { 
    Card, Form, Input, Button, Table, Space, 
    Typography, Modal, Select, Switch, message, 
    Tag, Divider, Tooltip, Popconfirm 
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
                    <Text strong>{text}</Text>
                    {record.isDefault && <Tag color="gold">默认</Tag>}
                </Space>
            )
        },
        {
            title: 'API Key',
            dataIndex: 'apiKey',
            key: 'apiKey',
            render: (text: string) => <Text type="secondary">••••••••{text.slice(-4)}</Text>
        },
        {
            title: 'Base URL',
            dataIndex: 'baseUrl',
            key: 'baseUrl',
            render: (text: string) => text || <Text type="secondary">官方接口</Text>
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: CredentialTemplate) => (
                <Space>
                    <Button type="link" icon={<EditOutlined />} onClick={() => {
                        setEditingTemplate(record);
                        templateForm.setFieldsValue(record);
                        setIsTemplateModalOpen(true);
                    }}>编辑</Button>
                    <Popconfirm title="确定删除此模板吗？" onConfirm={() => handleDeleteTemplate(record.id)}>
                        <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
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
            render: (text: string) => <Tag icon={<RocketOutlined />} color="blue">{text}</Tag>
        },
        {
            title: '关联凭据模板',
            dataIndex: 'template',
            key: 'template',
            render: (template: CredentialTemplate) => (
                <Space>
                    <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
                    <Text>{template?.name || '未知模板'}</Text>
                </Space>
            )
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: ModelConfig) => (
                <Popconfirm title="确定解除此映射吗？" onConfirm={() => record.id && handleDeleteMapping(record.id)}>
                    <Button type="link" danger icon={<DeleteOutlined />}>解除映射</Button>
                </Popconfirm>
            )
        }
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Title level={3}><KeyOutlined /> API 凭据与模型管理</Title>
            <Paragraph type="secondary">
                通过“模板+映射”机制，为不同的模型配置独立的 API Key 和中转地址。
            </Paragraph>

            <Divider />

            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card 
                  title={<span><SafetyCertificateOutlined style={{ marginRight: 8 }} />凭据模板 (Templates)</span>}
                  extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsTemplateModalOpen(true)}>新增模板</Button>}
                >
                    <Table 
                        dataSource={templates} 
                        columns={templateColumns} 
                        rowKey="id" 
                        loading={loading}
                        pagination={false}
                    />
                </Card>

                <Card 
                  title={<span><PartitionOutlined style={{ marginRight: 8 }} />模型映射 (Model Mappings)</span>}
                  extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsMappingModalOpen(true)}>添加映射</Button>}
                >
                    <Table 
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
                onCancel={() => { setIsTemplateModalOpen(false); setEditingTemplate(null); templateForm.resetFields(); }}
                onOk={() => templateForm.submit()}
                destroyOnClose
            >
                <Form form={templateForm} layout="vertical" onFinish={handleSaveTemplate}>
                    <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
                        <Input placeholder="例如：我的主账户、OpenRouter、测试用" />
                    </Form.Item>
                    <Form.Item name="apiKey" label="API Key" rules={[{ required: true }]}>
                        <Input.Password placeholder="sk-ant-..." />
                    </Form.Item>
                    <Form.Item name="baseUrl" label="API Base URL (可选)">
                        <Input prefix={<GlobalOutlined />} placeholder="https://api.anthropic.com" />
                    </Form.Item>
                    <Form.Item name="isDefault" label="设为默认模板" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            {/* 映射编辑弹窗 */}
            <Modal
                title="添加模型映射"
                open={isMappingModalOpen}
                onCancel={() => { setIsMappingModalOpen(false); mappingForm.resetFields(); }}
                onOk={() => mappingForm.submit()}
                destroyOnClose
            >
                <Form form={mappingForm} layout="vertical" onFinish={handleSaveMapping}>
                    <Form.Item name="modelId" label="模型 ID (Model ID)" rules={[{ required: true }]}>
                        <Input placeholder="例如：claude-3-5-sonnet-latest" />
                    </Form.Item>
                    <Form.Item name="templateId" label="关联凭据模板" rules={[{ required: true }]}>
                        <Select placeholder="选择一个凭据模板">
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
