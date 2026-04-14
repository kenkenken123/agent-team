import React, { useEffect, useState } from 'react';
import { Typography, Button, Space, Table, Spin, Empty, Tag, Divider, message, QRCode } from 'antd';
import { 
  CheckCircle2, 
  RotateCw, 
  XCircle, 
  MessageSquare, 
  Clock, 
  RefreshCw,
  LogOut,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { wechatApi, type WeChatStatus, type WeChatSession } from '../../api/wechat';
import './WeChat.css';

const { Title, Text, Paragraph } = Typography;

const WeChatPage: React.FC = () => {
  const [data, setData] = useState<WeChatStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  const fetchData = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await wechatApi.getStatus();
      setData(res);
    } catch (err: any) {
      console.error('Failed to fetch WeChat status:', err);
      // message.error('无法连接到微信服务');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
    // 每 5 秒轮询一次状态
    const timer = setInterval(() => fetchData(), 5000);
    return () => clearInterval(timer);
  }, []);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await wechatApi.reconnect();
      message.success('已请求生成新二维码');
      fetchData();
    } catch (err) {
      message.error('重连请求失败');
    } finally {
      setReconnecting(false);
    }
  };

  const statusMap = {
    disconnected: {
      text: '未连接',
      icon: <XCircle size={16} />,
      className: 'status-disconnected',
      desc: '微信服务已断开，请请求二维码重新登录。'
    },
    waiting_qr: {
      text: '等待扫码',
      icon: <RotateCw size={16} className="animate-spin" />,
      className: 'status-waiting',
      desc: '二维码已生成，请使用微信 App 扫描。'
    },
    scanned: {
      text: '已扫码',
      icon: <RotateCw size={16} className="animate-spin" />,
      className: 'status-waiting',
      desc: '请在手机微信上点击“确认登录”。'
    },
    connected: {
      text: '已连接',
      icon: <CheckCircle2 size={16} />,
      className: 'status-connected',
      desc: '机器人已在线，正在监听微信消息。'
    }
  };

  const currentStatus = data ? statusMap[data.loginStatus] : statusMap.disconnected;

  const columns = [
    {
      title: '用户 / 昵称',
      key: 'user',
      render: (_: any, record: WeChatSession) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.nickname || '微信用户'}</Text>
          <Text className="user-id">{record.userId}</Text>
        </Space>
      ),
    },
    {
      title: '消息数',
      dataIndex: 'messageCount',
      key: 'messageCount',
      sorter: (a: any, b: any) => a.messageCount - b.messageCount,
      render: (count: number) => (
        <Tag color="processing" icon={<MessageSquare size={12} style={{ marginRight: 4 }} />} className="token-tag">
          {count}
        </Tag>
      )
    },
    {
      title: '最后活跃',
      dataIndex: 'lastMessageAt',
      key: 'lastMessageAt',
      render: (time: string) => (
        <Space>
          <Clock size={14} style={{ color: '#8B949E' }} />
          <Text className="memory-time">
            {new Date(time).toLocaleString()}
          </Text>
        </Space>
      )
    }
  ];

  return (
    <div className="wechat-page">
      <div className="wechat-header">
        <Title level={2} style={{ color: '#F0F6FC', margin: 0 }}>微信接入管理</Title>
        <Text style={{ color: '#8B949E' }}>基于 WeChat iLink Bot 协议，将微信个人号作为 Agent 的消息入口</Text>
      </div>

      <div className="wechat-grid">
        {/* 左侧：状态与登录 */}
        <div className="status-card">
          <div className={`status-badge ${currentStatus.className}`}>
            {currentStatus.icon} {currentStatus.text}
          </div>

          <Title level={4} style={{ color: '#C9D1D9', marginTop: 0 }}>
            {data?.accountId ? `当前账号: ${data.accountId}` : '账号状态'}
          </Title>
          <Paragraph style={{ color: '#8B949E', fontSize: 13 }}>
            {currentStatus.desc}
          </Paragraph>

          <div className="qr-container">
            {loading ? (
              <Spin tip="载入中..." indicator={<RotateCw className="animate-spin" />} />
            ) : data?.qrUrl ? (
              <>
                <div style={{ background: '#fff', padding: 12, borderRadius: 8 }}>
                  <QRCode value={data.qrUrl} size={200} bordered={false} color="#000" bgColor="#fff" />
                </div>
                <Text
                  style={{ marginTop: 16, color: '#58A6FF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => data.qrUrl && window.open(data.qrUrl)}
                >
                  <RefreshCw size={14} /> 在浏览器中打开二维码
                </Text>
              </>
            ) : data?.loginStatus === 'connected' ? (
              <div style={{ textAlign: 'center' }}>
                <ShieldCheck size={64} color="#3fb950" style={{ marginBottom: 16, opacity: 0.8 }} />
                <br />
                <Text style={{ color: '#3fb950', fontWeight: 600 }}>服务正常运行中</Text>
              </div>
            ) : (
              <div style={{ marginTop: 24, padding: '0 24px' }}>
                <Button block type="primary" onClick={handleReconnect} loading={reconnecting} icon={<LogOut size={16} />}>
                  启动连接 / 切换账号
                </Button>
              </div>
            )}
          </div>

          <Divider style={{ borderColor: 'rgba(48, 54, 61, 0.5)' }} />

          <Space direction="vertical" style={{ width: '100%' }}>
            <Button 
              block 
              ghost
              onClick={handleReconnect} 
              loading={reconnecting}
              icon={<RotateCw size={16} className={reconnecting ? 'animate-spin' : ''} />}
            >
              强制重试
            </Button>
            {data?.connectedAt && (
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <Text className="memory-time">
                  上线时间: {new Date(data.connectedAt).toLocaleString()}
                </Text>
              </div>
            )}
          </Space>
        </div>

        {/* 右侧：活跃会话列表 */}
        <div className="session-card">
          <Title level={4} style={{ color: '#C9D1D9', marginTop: 0 }}>活跃会话 ({data?.sessionCount || 0})</Title>
          <Table 
            className="session-table"
            dataSource={data?.activeSessions || []} 
            columns={columns} 
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            rowKey="userId"
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活跃会话" /> }}
          />
        </div>
      </div>
    </div>
  );
};

export default WeChatPage;
