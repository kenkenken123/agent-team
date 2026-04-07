import React, { useState } from 'react';
import { Layout, Menu, Typography } from 'antd';
import {
  DashboardOutlined,
  RobotOutlined,
  CodeOutlined,
  HistoryOutlined,
  SettingOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons';
import Dashboard from '../../pages/Dashboard/Dashboard';
import AgentsPage from '../../pages/Agents/Agents';
import ConsolePage from '../../pages/Console/Console';
import HistoryPage from '../../pages/History/History';
import SimulationPage from '../../pages/Simulation/Simulation';
import SettingsPage from '../../pages/Settings/Settings';
import ButlerPage from '../../pages/Butler/Butler';
import { useAppStore } from '../../stores/appStore';
import type { PageKey } from '../../stores/appStore';
import './AppLayout.css';

const { Sider, Content } = Layout;
const { Text } = Typography;

const PAGE_MAP: Record<PageKey, React.ReactNode> = {
  dashboard: <Dashboard />,
  agents: <AgentsPage />,
  console: <ConsolePage />,
  history: <HistoryPage />,
  simulation: <SimulationPage />,
  settings: <SettingsPage />,
  butler: <ButlerPage />,
};

const AppLayout: React.FC = () => {
  const { currentPage, setPage } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout className="app-layout">
      <Sider
        className="app-sider"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        collapsedWidth={64}
      >
        {/* Logo */}
        <div className="app-logo">
          <div className="logo-icon">⚡</div>
          {!collapsed && (
            <div className="logo-text">
              <Text strong style={{ color: '#F0F6FC', fontSize: 15 }}>Agent Team</Text>
              <Text style={{ color: '#8B949E', fontSize: 11 }}>Claude Code 控制台</Text>
            </div>
          )}
        </div>

        <Menu
          className="app-menu"
          mode="inline"
          selectedKeys={[currentPage]}
          onClick={({ key }) => setPage(key as PageKey)}
          items={[
            {
              key: 'butler',
              icon: <CustomerServiceOutlined />,
              label: '管家',
            },
            {
              key: 'dashboard',
              icon: <DashboardOutlined />,
              label: '仪表盘',
            },
            {
              key: 'agents',
              icon: <RobotOutlined />,
              label: 'Agent 管理',
            },
            {
              key: 'console',
              icon: <CodeOutlined />,
              label: '任务控制台',
            },
            {
              key: 'history',
              icon: <HistoryOutlined />,
              label: '任务历史',
            },
            {
              key: 'simulation',
              icon: <RobotOutlined />,
              label: '赛博世界',
            },
            {
              key: 'settings',
              icon: <SettingOutlined />,
              label: '系统设置',
            },
          ]}
        />

        {/* 底部版本信息 */}
        {!collapsed && (
          <div className="app-version">
            <Text style={{ color: '#484F58', fontSize: 11 }}>v1.0.0 · 一期</Text>
          </div>
        )}
      </Sider>

      <Content className="app-content">
        {PAGE_MAP[currentPage]}
      </Content>
    </Layout>
  );
};

export default AppLayout;
