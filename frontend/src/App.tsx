import React from 'react';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#58A6FF',
          colorBgBase: '#0D1117',
          colorBgContainer: '#161B22',
          colorBgElevated: '#1C2128',
          colorBorder: '#30363D',
          colorText: '#C9D1D9',
          colorTextSecondary: '#8B949E',
          borderRadius: 8,
          fontFamily: "'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Menu: {
            itemBg: 'transparent',
            darkItemBg: 'transparent',
          },
          Table: {
            headerBg: '#21262D',
            rowHoverBg: '#21262D',
          },
          Drawer: {
            colorBgElevated: '#0D1117',
          },
        },
      }}
    >
      <ErrorBoundary>
        <AppLayout />
      </ErrorBoundary>
    </ConfigProvider>
  );
};

export default App;
