import React, { useEffect, useState } from 'react';
import { Card, Typography, List, Modal, Input, Button, message, Space, Tabs, Descriptions, Popconfirm, Spin, Alert, Tag } from 'antd';
import { Brain, RefreshCw, PenLine, Trash2, Save, X, FileText, User, MessageSquare } from 'lucide-react';
import { memoryApi } from '../../api/memoryApi';
import type { LongTermMemory, ShortTermMemory } from '../../api/memoryApi';
import './ButlerMemory.css';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const MAX_LONG_TERM_CHARS = 2200;

const ButlerMemoryPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [longTerm, setLongTerm] = useState<LongTermMemory | null>(null);
  const [shortTerm, setShortTerm] = useState<ShortTermMemory[]>([]);
  const [userProfile, setUserProfile] = useState<string>('{}');

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [charCount, setCharCount] = useState(0);

  const [profileEditing, setProfileEditing] = useState(false);
  const [profileContent, setProfileContent] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ltArr, st, profile] = await Promise.all([
        memoryApi.getLongTermMemory(),
        memoryApi.getShortTermMemories(),
        memoryApi.getUserProfile()
      ]);
      // 单条模式：取数组第一条或null
      setLongTerm(ltArr.length > 0 ? ltArr[0] : null);
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

  const handleSaveLongTerm = async () => {
    if (editContent.length > MAX_LONG_TERM_CHARS) {
      message.error(`内容不能超过${MAX_LONG_TERM_CHARS}字，当前${editContent.length}字`);
      return;
    }
    try {
      await memoryApi.updateLongTermMemory(editContent);
      message.success('保存成功');
      setIsEditing(false);
      fetchData();
    } catch (error) {
      message.error('保存失败');
    }
  };

  const handleDeleteLongTerm = async () => {
    try {
      await memoryApi.deleteLongTermMemory();
      message.success('已清空长期记忆');
      setLongTerm(null);
      fetchData();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleUpdateProfile = async () => {
    try {
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
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="长期记忆为单条模式，所有通用规则、偏好、经验合并存储在一条记忆中，不超过2200字。超出时系统自动压缩取舍。"
      />
      {longTerm === null ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <FileText size={48} color="#8B949E" style={{ marginBottom: 12 }} />
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>暂无长期记忆</Text>
          <Button type="primary" onClick={() => { setIsEditing(true); setEditContent(''); setCharCount(0); }}>
            创建长期记忆
          </Button>
        </div>
      ) : (
        <div className="memory-item">
          <div style={{ flex: 1, marginRight: 16 }}>
            <div style={{ marginBottom: 6 }}>
              <Tag color="purple">单条记忆</Tag>
              <Text className="memory-time" style={{ marginLeft: 8 }}>
                更新于: {new Date(longTerm.updatedAt).toLocaleString()}
              </Text>
              <Text type="secondary" style={{ marginLeft: 8 }}>
                {longTerm.content.length} / {MAX_LONG_TERM_CHARS} 字
              </Text>
            </div>
            {isEditing ? (
              <div style={{ marginTop: 8 }}>
                <TextArea
                  rows={12}
                  value={editContent}
                  onChange={e => { setEditContent(e.target.value); setCharCount(e.target.value.length); }}
                  placeholder="输入长期记忆内容..."
                />
                <div style={{ marginTop: 4, textAlign: 'right' }}>
                  <Text type={charCount > MAX_LONG_TERM_CHARS ? 'danger' : 'secondary'}>
                    {charCount} / {MAX_LONG_TERM_CHARS} 字
                  </Text>
                </div>
                <Space style={{ marginTop: 8 }}>
                  <Button type="primary" size="small" onClick={handleSaveLongTerm}>保存</Button>
                  <Button size="small" onClick={() => setIsEditing(false)}>取消</Button>
                </Space>
              </div>
            ) : (
              <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#C9D1D9' }}>{longTerm.content}</Paragraph>
            )}
          </div>
          {!isEditing && (
            <Space>
              <Button
                type="text"
                className="btn-edit-memory"
                icon={<PenLine size={16} />}
                onClick={() => {
                  setIsEditing(true);
                  setEditContent(longTerm.content);
                  setCharCount(longTerm.content.length);
                }}
              >
                编辑
              </Button>
              <Popconfirm title="确定要清空长期记忆吗？" onConfirm={handleDeleteLongTerm}>
                <Button type="text" className="btn-delete-memory" icon={<Trash2 size={16} />}>清空</Button>
              </Popconfirm>
            </Space>
          )}
        </div>
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="profile-container">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="用户画像应包含 preferences（偏好）、skills（技能）、projectContext（项目上下文）、routingRules（路由规则）、habits（习惯）五个维度。系统会自动从对话中提取并更新。"
      />
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
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="短期记忆自动截断过长内容（每条最多500字），仅保留最近10条交互记录，每5轮对话触发周期评估。"
      />
      {shortTerm.length === 0 ? (
        <Text type="secondary" style={{ padding: 24, display: 'block', textAlign: 'center' }}>暂无短期交互记录</Text>
      ) : (
        shortTerm.map((item, index) => (
          <div key={index} style={{ padding: '16px 0', borderBottom: '1px dashed rgba(48, 54, 61, 0.3)' }}>
            <div style={{ marginBottom: 4 }}>
              <Text strong style={{ color: item.role === 'user' ? '#58A6FF' : '#3FB950' }}>{item.role === 'user' ? '👤 提问 (User)' : '🤖 管家 (Assistant)'}</Text>
              {item.content.length >= 500 && <Tag color="orange" style={{ marginLeft: 8 }}>已截断</Tag>}
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
              {
                label: <span><FileText size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />长期记忆</span>,
                key: 'longterm',
                children: renderLongTerm()
              },
              {
                label: <span><User size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />用户画像</span>,
                key: 'profile',
                children: renderProfile()
              },
              {
                label: <span><MessageSquare size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />短期交互</span>,
                key: 'shortterm',
                children: renderShortTerm()
              },
            ]}
          />
        </Card>
      </Spin>
    </div>
  );
};

export default ButlerMemoryPage;