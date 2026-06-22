import { useState } from 'react';
import { Card, Form, Input, Button, message, Space } from 'antd';
import { UserOutlined, LockOutlined, RocketOutlined } from '@ant-design/icons';
import { authApi } from '../../api/saasApi';
import { useAuthStore } from '../../stores/authStore';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await authApi.login({
        username: values.username,
        password: values.password,
      });
      message.success('登录成功');
      setAuth(res.token, res.user ?? null, res.isAdmin ?? false);
    } catch (err: any) {
      message.error(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100vw',
        height: '100vh',
        background: 'radial-gradient(circle at center, #11121d 0%, #040508 100%)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          background: 'rgba(168, 85, 247, 0.1)',
          borderRadius: '50%',
          filter: 'blur(80px)',
          top: '10%',
          left: '15%',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          background: 'rgba(99, 102, 241, 0.1)',
          borderRadius: '50%',
          filter: 'blur(80px)',
          bottom: '10%',
          right: '15%',
          pointerEvents: 'none',
        }}
      />

      <Card
        className="glass-card"
        style={{
          width: 420,
          padding: '24px 12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
        bordered={false}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Space align="center" style={{ marginBottom: 12 }}>
            <RocketOutlined style={{ fontSize: 32, color: '#a855f7' }} />
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '1px' }} className="gradient-text">
              Claude Code Hub
            </span>
          </Space>
          <div style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: 14 }}>
            欢迎回来，请输入您的凭据
          </div>
        </div>

        <Form name="login_form" size="large" onFinish={onFinish} layout="vertical">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: 'rgba(255,255,255,0.25)' }} />}
              placeholder="用户名"
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
              }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: 'rgba(255,255,255,0.25)' }} />}
              placeholder="密码"
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
              }}
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              className="glow-btn"
              style={{ height: 44, fontSize: 16 }}
            >
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
