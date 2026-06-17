import { useState, useEffect } from 'react';
import { Card, Button, Input, Tag, Space, Typography, message } from 'antd';
import { PlusOutlined, SaveOutlined, SettingOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons';
import { agentsApi } from '../../api/saasApi';

const { Title, Paragraph } = Typography;

export default function Models() {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const loadModels = async () => {
    setLoading(true);
    try {
      const list = await agentsApi.getModels();
      setModels(list || []);
    } catch (err: any) {
      message.error(err.message || '获取模型列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index.toString());
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const updated = [...models];
    const draggedItem = updated[draggedIndex];
    updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    setModels(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleClose = (removedModel: string) => {
    const newModels = models.filter((m) => m !== removedModel);
    setModels(newModels);
  };

  const handleInputConfirm = () => {
    if (inputValue && models.indexOf(inputValue) === -1) {
      setModels([...models, inputValue.trim()]);
    }
    setInputValue('');
  };

  const handleSave = async () => {
    if (models.length === 0) {
      message.warning('模型列表不能为空');
      return;
    }
    setSaving(true);
    try {
      await agentsApi.saveModels(models);
      message.success('模型列表配置保存成功！');
    } catch (err: any) {
      message.error(err.message || '保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '8px', maxWidth: 800 }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0, fontWeight: 700 }} className="gradient-text">
          自定义模型列表
        </Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.45)', margin: '4px 0 0 0' }}>
          在这里配置该租户专属的可用模型列表，保存后的模型将在开启新开发会话时供您选择。
        </Paragraph>
      </div>

      <Card
        bordered={false}
        className="glass-card"
        title={
          <Space style={{ color: '#a855f7' }}>
            <SettingOutlined />
            <span>模型 ID 配置</span>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            className="glow-btn"
          >
            保存配置
          </Button>
        }
      >
        <Paragraph style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 20 }}>
          您可以添加任何兼容 Claude 或支持平台接入的通用模型 ID。直接在此添加后即可在聊天框的下拉菜单中直接选择：
        </Paragraph>

        <div style={{ minHeight: 180, maxHeight: 320, overflowY: 'auto', background: '#090a0f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, marginBottom: 20 }}>
          {loading ? (
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>正在加载可用模型...</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {models.map((m, index) => (
                <div
                  key={m}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 16px',
                    borderRadius: 6,
                    background: draggedIndex === index ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    border: draggedIndex === index ? '1px dashed rgba(168, 85, 247, 0.5)' : '1px solid rgba(255, 255, 255, 0.05)',
                    cursor: 'grab',
                    transition: 'background 0.2s, border 0.2s',
                  }}
                >
                  <Space size={8}>
                    <HolderOutlined style={{ color: 'rgba(255,255,255,0.25)', cursor: 'grab', marginRight: 4 }} />
                    <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, fontFamily: 'monospace' }}>
                      {(index + 1).toString().padStart(2, '0')}
                    </span>
                    <Tag
                      color="purple"
                      style={{
                        padding: '2px 8px',
                        fontSize: 13,
                        borderRadius: 4,
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        background: 'rgba(168, 85, 247, 0.1)',
                        color: '#c084fc',
                        fontFamily: 'monospace',
                      }}
                    >
                      {m}
                    </Tag>
                  </Space>
                  
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    danger
                    onClick={() => handleClose(m)}
                  />
                </div>
              ))}
              {models.length === 0 && (
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                  无自定义配置模型，将自动回退使用系统默认配置
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, maxWidth: 400 }}>
          <Input
            placeholder="输入新模型 ID (如: claude-3-5-haiku-20241022)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={handleInputConfirm}
            style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          />
          <Button icon={<PlusOutlined />} onClick={handleInputConfirm}>
            添加
          </Button>
        </div>
      </Card>
    </div>
  );
}
