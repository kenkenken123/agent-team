import { ConfigProvider, theme } from 'antd';
import { useAuthStore } from './stores/authStore';
import Login from './pages/Login/Login';
import SaasLayout from './components/Layout/SaasLayout';
import Dashboard from './pages/Dashboard/Dashboard';
import Files from './pages/Files/Files';
import Skills from './pages/Skills/Skills';
import Agents from './pages/Agents/Agents';

function App() {
  const token = useAuthStore((state) => state.token);

  if (!token) {
    return (
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <Login />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <SaasLayout>
        {(activeKey) => {
          switch (activeKey) {
            case 'dashboard':
              return <Dashboard />;
            case 'files':
              return <Files />;
            case 'skills':
              return <Skills />;
            case 'agents':
              return <Agents />;
            default:
              return <Dashboard />;
          }
        }}
      </SaasLayout>
    </ConfigProvider>
  );
}

export default App;
