import React, { useEffect, useState } from 'react';
import { Card, Typography, List, Modal, Input, Button, message, Space, Tabs, Descriptions, Popconfirm, Spin } from 'antd';
import { Brain, RefreshCw, PenLine, Trash2, Save, X } from 'lucide-react';
import { memoryApi } from '../../api/memoryApi';
import type { LongTermMemory, ShortTermMemory } from '../../api/memoryApi';
import './ButlerMemory.css';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const ButlerMemoryPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [longTerm, setLongTerm] = useState<LongTermMemory[]>([]);
  const [shortTerm, setShortTerm] = useState<ShortTermMemory[]>([]);
  const [userProfile, setUserProfile] = useState<string>('{}');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const [profileEditing, setProfileEditing] = useState(false);
  const [profileContent, setProfileContent] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lt, st, profile] = await Promise.all([
        memoryApi.getLongTermMemories(),
        memoryApi.getShortTermMemories(),
        memoryApi.getUserProfile()
      ]);
      setLongTerm(lt);
      setShortTerm(st);
      setUserProfile(typeof profile === 'string' ? profile : JSON.stringify(profile, null, 2));
    } catch (error) {
      console.error(error);
      message.error('加载记忆数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateLongTerm = async () => {
    if (!editingId) return;
    try {
      await memoryApi.updateLongTermMemory(editingId, editContent);
      message.success('更新成功');
      setEditingId(null);
      fetchData();
    } catch (error) {
      message.error('更新失败');
    }
  };

  const handleDeleteLongTerm = async (id: string) => {
    try {
      await memoryApi.deleteLongTermMemory(id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleUpdateProfile = async () => {
    try {
      // JSON validation
      JSON.parse(profileContent);
      await memoryApi.updateUserProfile(profileContent);
      message.success('保存画像成功');
      setProfileEditing(false);
      fetchData();
    } catch (e) {
      message.error('JSON格式不正确或者保存失败');
    }
  };

  const renderLongTerm = () => (
    <div className="memory-list">
      {longTerm.length === 0 ? (
        <Text type="secondary" style={{ padding: 24, display: 'block', textAlign: 'center' }}>暂无长期记忆</Text>
      ) : (
        longTerm.map(item => (
          <div key={item.id} className="memory-item">
            <div style={{ flex: 1, marginRight: 16 }}>
              <div style={{ marginBottom: 6 }}>
                <Text className="memory-id">#{item.id.substring(0, 8)}</Text>
                <Text className="memory-time" style={{ marginLeft: 12 }}>
                  更新于: {new Date(item.updatedAt).toLocaleString()}
                </Text>
              </div>
              {editingId === item.id ? (
                <div style={{ marginTop: 8 }}>
                  <TextArea rows={4} value={editContent} onChange={e => setEditContent(e.target.value)} />
                  <Space style={{ marginTop: 8 }}>
                    <Button type="primary" size="small" onClick={handleUpdateLongTerm}>保存</Button>
                    <Button size="small" onClick={() => setEditingId(null)}>取消</Button>
                  </Space>
                </div>
              ) : (
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#C9D1D9' }}>{item.content}</Paragraph>
              )}
            </div>
            <Space>
               <Button
                type="text"
                className="btn-edit-memory"
                icon={<PenLine size={16} />}
                onClick={() => {
                  setEditingId(item.id);
                  setEditContent(item.content);
                }}
              >
                编辑
              </Button>
              <Popconfirm title="确定要删除这条长期记忆吗？" onConfirm={() => handleDeleteLongTerm(item.id)}>
                <Button type="text" className="btn-delete-memory" icon={<Trash2 size={16} />}>删除</Button>
              </Popconfirm>
            </Space>
          </div>
        ))
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="profile-container">
      {profileEditing ? (
        <>
          <TextArea
            rows={15}
            value={profileContent}
            onChange={e => setProfileContent(e.target.value)}
            style={{ fontFamily: 'monospace' }}
          />
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" icon={<Save size={16} />} onClick={handleUpdateProfile}>保存信息</Button>
            <Button icon={<X size={16} />} onClick={() => setProfileEditing(false)}>取消</Button>
          </Space>
        </>
      ) : (
        <>
          <pre className="profile-pre">{userProfile}</pre>
          <Button type="text" className="btn-edit-memory" icon={<PenLine size={16} />} onClick={() => {
            setProfileContent(userProfile);
            setProfileEditing(true);
          }}>
            修改用户画像
          </Button>
        </>
      )}
    </div>
  );

  const renderShortTerm = () => (
    <div className="memory-list short-term-list">
      {shortTerm.length === 0 ? (
        <Text type="secondary" style={{ padding: 24, display: 'block', textAlign: 'center' }}>暂无短期交互记录</Text>
      ) : (
        shortTerm.map((item, index) => (
          <div key={index} style={{ padding: '16px 0', borderBottom: '1px dashed rgba(48, 54, 61, 0.3)' }}>
            <div style={{ marginBottom: 4 }}>
              <Text strong style={{ color: item.role === 'user' ? '#58A6FF' : '#3FB950' }}>{item.role === 'user' ? '👤 提问 (User)' : '🤖 管家 (Assistant)'}</Text>
            </div>
            <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#8B949E' }}>
              {item.content}
              <br/>
              <Text type="secondary" style={{ fontSize: 12 }}>{new Date(item.timestamp).toLocaleString()}</Text>
            </Paragraph>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="butler-memory-page">
      <Space className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Brain size={32} color="#a371f7" />
          <div>
            <Title level={2}>管家记忆</Title>
            <Text type="secondary">管理和查看核心管家为用户和系统积攒的各类记忆数据。</Text>
          </div>
        </div>
        <Button 
          icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} 
          onClick={fetchData} 
          loading={loading}
        >
          刷新数据
        </Button>
      </Space>

      <Spin spinning={loading}>
        <Card variant="borderless" className="glass-card">
          <Tabs
            defaultActiveKey="longterm"
            items={[
              { label: '长期记忆库', key: 'longterm', children: renderLongTerm() },
              { label: '用户画像', key: 'profile', children: renderProfile() },
              { label: '近期短记忆序列', key: 'shortterm', children: renderShortTerm() },
            ]}
          />
        </Card>
      </Spin>
    </div>
  );
};

export default ButlerMemoryPage;
