import { useState, useEffect } from 'react';
import {
  Table, Button, Input, InputNumber, Space, Typography, message,
  Tag, Tooltip, Popconfirm,
} from 'antd';
import {
  SaveOutlined, PlusOutlined, DeleteOutlined,
  ReloadOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { adminApi } from '../../api/saasApi';

const { Title, Paragraph } = Typography;

interface PricingRow {
  key: string;
  modelId: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheInputPricePerMillion: number;
}

let rowCounter = 0;

export default function AdminModelPricing() {
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newModelId, setNewModelId] = useState('');

  const loadPricing = async () => {
    setLoading(true);
    try {
      const data: any[] = await adminApi.getModelPricing();
      setRows(data.map((d) => ({
        key: d.modelId,
        modelId: d.modelId,
        inputPricePerMillion: d.inputPricePerMillion,
        outputPricePerMillion: d.outputPricePerMillion,
        cacheInputPricePerMillion: d.cacheInputPricePerMillion ?? 0,
      })));
    } catch (err: any) {
      message.error(err.message || '获取计费配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPricing(); }, []);

  const handleAddRow = () => {
    const id = newModelId.trim();
    if (!id) { message.warning('请输入模型 ID'); return; }
    if (rows.some((r) => r.modelId === id)) { message.warning('该模型 ID 已存在'); return; }
    rowCounter += 1;
    setRows([...rows, { key: `new-${rowCounter}`, modelId: id, inputPricePerMillion: 0, outputPricePerMillion: 0, cacheInputPricePerMillion: 0 }]);
    setNewModelId('');
  };

  const handleUpdateField = (
    key: string,
    field: 'inputPricePerMillion' | 'outputPricePerMillion' | 'cacheInputPricePerMillion',
    value: number | null,
  ) => {
    setRows(rows.map((r) => r.key === key ? { ...r, [field]: value ?? 0 } : r));
  };

  const handleDelete = (key: string) => setRows(rows.filter((r) => r.key !== key));

  const handleSave = async () => {
    setSaving(true);
    try {
      const items = rows.map((r) => ({
        modelId: r.modelId,
        inputPricePerMillion: r.inputPricePerMillion,
        outputPricePerMillion: r.outputPricePerMillion,
        cacheInputPricePerMillion: r.cacheInputPricePerMillion,
      }));
      await adminApi.saveModelPricing(items);
      message.success('计费配置保存成功！');
      loadPricing();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 通用价格列渲染
  const priceRenderer = (field: 'inputPricePerMillion' | 'outputPricePerMillion' | 'cacheInputPricePerMillion') =>
    (_: any, record: PricingRow) => (
      <InputNumber
        min={0}
        precision={4}
        step={0.1}
        value={record[field]}
        onChange={(v) => handleUpdateField(record.key, field, v)}
        prefix="¥"
        style={{
          width: 150,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
        }}
      />
    );

  const columns = [
    {
      title: '模型 ID',
      dataIndex: 'modelId',
      key: 'modelId',
      render: (id: string) => (
        <Tag
          color="purple"
          style={{
            fontSize: 13,
            padding: '2px 10px',
            fontFamily: 'monospace',
            border: '1px solid rgba(168,85,247,0.3)',
            background: 'rgba(168,85,247,0.1)',
            color: '#c084fc',
          }}
        >
          {id}
        </Tag>
      ),
    },
    {
      title: (
        <Tooltip title="每输入 100万 Token 的费用（人民币）">
          输入价格 / 百万 Token <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />
        </Tooltip>
      ),
      key: 'inputPricePerMillion',
      width: 200,
      render: priceRenderer('inputPricePerMillion'),
    },
    {
      title: (
        <Tooltip title="每输出 100万 Token 的费用（人民币）">
          输出价格 / 百万 Token <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />
        </Tooltip>
      ),
      key: 'outputPricePerMillion',
      width: 200,
      render: priceRenderer('outputPricePerMillion'),
    },
    {
      title: (
        <Tooltip title="命中缓存时每输入 100万 Token 的费用（人民币），通常低于标准输入价格">
          缓存输入价格 / 百万 Token <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />
        </Tooltip>
      ),
      key: 'cacheInputPricePerMillion',
      width: 220,
      render: priceRenderer('cacheInputPricePerMillion'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_: any, record: PricingRow) => (
        <Popconfirm
          title="删除该模型计费配置？"
          okText="确认"
          cancelText="取消"
          onConfirm={() => handleDelete(record.key)}
        >
          <Tooltip title="移除">
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Tooltip>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: '8px', maxWidth: 1100 }}>
      {/* 页头 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 700 }} className="gradient-text">
            模型计费配置
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.45)', margin: '4px 0 0 0' }}>
            按模型设置每百万 Token 的输入 / 输出 / 缓存输入费用（人民币），未配置则计费为 0。
          </Paragraph>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadPricing}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            className="glow-btn"
          >
            保存全部
          </Button>
        </Space>
      </div>

      {/* 添加新行 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, maxWidth: 600 }}>
        <Input
          placeholder="输入模型 ID（如：claude-3-5-sonnet-20241022）"
          value={newModelId}
          onChange={(e) => setNewModelId(e.target.value)}
          onPressEnter={handleAddRow}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#fff',
          }}
        />
        <Button icon={<PlusOutlined />} onClick={handleAddRow}>添加模型</Button>
      </div>

      {/* 表格 */}
      <Table
        dataSource={rows}
        columns={columns}
        rowKey="key"
        loading={loading}
        pagination={false}
        className="glass-card"
        locale={{ emptyText: '暂无计费配置，点击"添加模型"开始配置' }}
        scroll={{ x: 800 }}
      />

      {/* 说明 */}
      <div
        style={{
          marginTop: 16,
          padding: '12px 16px',
          background: 'rgba(245, 158, 11, 0.06)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: 8,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 13,
        }}
      >
        💡 费用单位：<b style={{ color: 'rgba(255,255,255,0.75)' }}>人民币（CNY）/ 百万 Token</b>。
        「缓存输入」指命中 Prompt Cache 时实际消耗的 Token 费用，通常低于标准输入价格。
        所有价格变更在点击「保存全部」后生效。
      </div>
    </div>
  );
}
