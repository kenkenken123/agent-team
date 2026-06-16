import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space } from 'antd';
import {
  DashboardOutlined,
  FolderOpenOutlined,
  BookOutlined,
  LogoutOutlined,
  RocketOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';

const { Header, Content, Sider } = Layout;

interface SaasLayoutProps {
  children: (activeKey: string) => React.ReactNode;
}

export default function SaasLayout({ children }: SaasLayoutProps) {
  const [activeKey, setActiveKey] = useState('dashboard');
  const { user, logout } = useAuthStore();

  const getAvatarColor = (name: string) => {
    const colors = ['#7265e6', '#ffbf00', '#00a2ae', '#87d068', '#1890ff', '#108ee9', '#a855f7'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const username = user?.username || 'Guest';
  const initial = username.charAt(0).toUpperCase();

  const menuItems = [
    { key: 'dashboard', icon: <DashboardOutlined />, label: '个人工作台' },
    { key: 'files', icon: <FolderOpenOutlined />, label: '专属文件区' },
    { key: 'skills', icon: <BookOutlined />, label: '专属 Skills' },
    { key: 'agents', icon: <MessageOutlined />, label: '我的会话' },
  ];

  const profileMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: () => logout(),
      },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh', width: '100vw' }}>
      <Sider width={220} theme="dark" collapsible>
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            gap: 8,
          }}
        >
          <RocketOutlined style={{ fontSize: 24, color: '#a855f7' }} />
          <span style={{ fontSize: 16, fontWeight: 700 }} className="gradient-text">
            SaaS Code Hub
          </span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={({ key }) => setActiveKey(key)}
          style={{ marginTop: 16 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            height: 64,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <Dropdown menu={profileMenu} trigger={['click']}>
            <Space style={{ cursor: 'pointer' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{username}</span>
              <Avatar
                style={{
                  backgroundColor: getAvatarColor(username),
                  verticalAlign: 'middle',
                }}
                size="large"
              >
                {initial}
              </Avatar>
            </Space>
          </Dropdown>
        </Header>
        <Content
          style={{
            margin: '24px',
            padding: '24px',
            background: 'rgba(255, 255, 255, 0.01)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            overflowY: 'auto',
          }}
        >
          {children(activeKey)}
        </Content>
      </Layout>
    </Layout>
  );
}
