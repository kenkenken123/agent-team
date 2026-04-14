import React, { useState } from 'react';
import { Layout, Menu, Typography } from 'antd';
import {
  DashboardOutlined,
  RobotOutlined,
  CodeOutlined,
  HistoryOutlined,
  SettingOutlined,
  CustomerServiceOutlined,
  KeyOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import Dashboard from '../../pages/Dashboard/Dashboard';
import AgentsPage from '../../pages/Agents/Agents';
import ConsolePage from '../../pages/Console/Console';
import HistoryPage from '../../pages/History/History';
import SimulationPage from '../../pages/Simulation/Simulation';
import SettingsPage from '../../pages/Settings/Settings';
import ButlerPage from '../../pages/Butler/Butler';
import ConfigManager from '../../pages/Config/ConfigManager';
import KanbanPage from '../../pages/Kanban/Kanban';
import SystemManagementPage from '../../pages/SystemManagement/SystemManagement';
import InitialSetupPage from '../../pages/InitialSetup/InitialSetup';
import WeChatPage from '../../pages/WeChat/WeChat';
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
  config: <ConfigManager />,
  kanban: <KanbanPage />,
  system: <SystemManagementPage />,
  initialSetup: <InitialSetupPage />,
  wechat: <WeChatPage />,
};

const AppLayout: React.FC = () => {
  const { currentPage, setPage } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);

  // 判断当前页面是否在系统管理子菜单下
  const isSystemChild = currentPage === 'settings' || currentPage === 'agents' || currentPage === 'config' || currentPage === 'initialSetup' || currentPage === 'wechat';
  const selectedMainKey = isSystemChild ? 'system' : currentPage;

  return (
    <Layout className="app-layout">
      <Sider
        className="app-sider-glass"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        collapsedWidth={64}
      >
        <div className="app-logo">
          <div className="logo-icon">⚡</div>
          {!collapsed && (
            <div className="logo-text">
              <Text strong style={{ color: '#F0F6FC', fontSize: 16 }}>Agent Team</Text>
              <Text style={{ color: '#8B949E', fontSize: 10 }}>Claude Code 控制台</Text>
            </div>
          )}
        </div>

        <Menu
          className="app-menu"
          mode="inline"
          selectedKeys={[selectedMainKey]}
          onClick={({ key }) => setPage(key as PageKey)}
          items={[
            {
              key: 'butler',
              icon: <CustomerServiceOutlined />,
              label: '管家',
            },
            {
              key: 'kanban',
              icon: <AppstoreOutlined />,
              label: '会话看板',
            },
            {
              key: 'console',
              icon: <CodeOutlined />,
              label: '控制台',
            },
            {
              key: 'simulation',
              icon: <RobotOutlined />,
              label: '赛博世界',
            },
            {
              key: 'dashboard',
              icon: <DashboardOutlined />,
              label: '仪表盘',
            },
            {
              key: 'history',
              icon: <HistoryOutlined />,
              label: '历史任务',
            },
            {
              key: 'system',
              icon: <SettingOutlined />,
              label: '系统管理',
              children: [
                {
                  key: 'initialSetup',
                  icon: <ThunderboltOutlined />,
                  label: '初始环境',
                },
                {
                  key: 'settings',
                  icon: <SettingOutlined />,
                  label: '系统设置',
                },
                {
                  key: 'agents',
                  icon: <RobotOutlined />,
                  label: 'Agent 管理',
                },
                {
                  key: 'config',
                  icon: <KeyOutlined />,
                  label: 'API 凭证',
                },
                {
                  key: 'wechat',
                  icon: <WechatOutlined />,
                  label: '微信接入',
                },
              ],
            },
          ]}
        />

        {!collapsed && (
          <div className="app-version">
            <Text style={{ color: '#484F58', fontSize: 11 }}>v1.0.0 · Premium</Text>
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
