import { ConfigProvider, theme } from 'antd';
import { useAuthStore } from './stores/authStore';
import Login from './pages/Login/Login';
import SaasLayout from './components/Layout/SaasLayout';
import AdminLayout from './components/Layout/AdminLayout';
import Files from './pages/Files/Files';
import Skills from './pages/Skills/Skills';
import Agents from './pages/Agents/Agents';
import Models from './pages/Models/Models';
import AdminUsers from './pages/Admin/AdminUsers';
import AdminModelPricing from './pages/Admin/AdminModelPricing';

function App() {
  const token = useAuthStore((state) => state.token);
  const isAdmin = useAuthStore((state) => state.isAdmin);

  if (!token) {
    return (
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <Login />
      </ConfigProvider>
    );
  }

  // 管理员界面
  if (isAdmin) {
    return (
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <AdminLayout>
          {(activeKey) => {
            switch (activeKey) {
              case 'admin-users':
                return <AdminUsers />;
              case 'admin-pricing':
                return <AdminModelPricing />;
              default:
                return <AdminUsers />;
            }
          }}
        </AdminLayout>
      </ConfigProvider>
    );
  }

  // 普通租户界面
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <SaasLayout>
        {(activeKey) => {
          switch (activeKey) {
            case 'dashboard':
              return <Agents />;
            case 'files':
              return <Files />;
            case 'skills':
              return <Skills />;
            case 'models':
              return <Models />;
            default:
              return <Agents />;
          }
        }}
      </SaasLayout>
    </ConfigProvider>
  );
}

export default App;
