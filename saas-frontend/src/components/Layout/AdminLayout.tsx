import React, { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space, Tag } from 'antd';
import {
  TeamOutlined,
  DollarOutlined,
  LogoutOutlined,
  RocketOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';

const { Header, Content, Sider } = Layout;

interface AdminLayoutProps {
  children: (activeKey: string) => React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [activeKey, setActiveKey] = useState(() => {
    const hash = window.location.hash.substring(1);
    const validKeys = ['admin-users', 'admin-pricing'];
    return validKeys.includes(hash) ? hash : 'admin-users';
  });
  const { logout } = useAuthStore();

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1);
      const validKeys = ['admin-users', 'admin-pricing'];
      if (validKeys.includes(hash)) setActiveKey(hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    const hash = window.location.hash.substring(1);
    const validKeys = ['admin-users', 'admin-pricing'];
    if (!hash || !validKeys.includes(hash)) {
      window.location.hash = '#' + activeKey;
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeKey]);

  const menuItems = [
    { key: 'admin-users', icon: <TeamOutlined />, label: '用户管理' },
    { key: 'admin-pricing', icon: <DollarOutlined />, label: '模型计费' },
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
          <RocketOutlined style={{ fontSize: 22, color: '#f59e0b' }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>
            管理控制台
          </span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={({ key }) => {
            window.location.hash = '#' + key;
          }}
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
              <Tag
                icon={<CrownOutlined />}
                color="gold"
                style={{ fontSize: 13, padding: '2px 10px', borderRadius: 12 }}
              >
                管理员
              </Tag>
              <Avatar
                style={{ backgroundColor: '#f59e0b', verticalAlign: 'middle' }}
                size="large"
              >
                A
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
