import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Space, Popconfirm,
  Typography, message, Tag, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  TeamOutlined, ReloadOutlined, SyncOutlined,
} from '@ant-design/icons';
import { adminApi } from '../../api/saasApi';

const { Title, Paragraph } = Typography;

interface UserRow {
  id: string;
  username: string;
  createdAt: string;
}

// 生成随机密码：大小写字母 + 数字，12位
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers();
      setUsers(data);
    } catch (err: any) {
      message.error(err.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const openCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditingUser(user);
    form.setFieldsValue({ username: user.username, password: '' });
    setModalOpen(true);
  };

  const handleRandomPassword = () => {
    const pwd = generatePassword();
    form.setFieldValue('password', pwd);
    message.success(`已生成随机密码：${pwd}`, 4);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (editingUser) {
        const payload: any = {};
        if (values.username?.trim()) payload.username = values.username.trim();
        if (values.password?.trim()) payload.password = values.password.trim();
        await adminApi.updateUser(editingUser.id, payload);
        message.success('用户信息已更新');
      } else {
        await adminApi.createUser({ username: values.username.trim(), password: values.password.trim() });
        message.success('用户创建成功');
      }
      setModalOpen(false);
      loadUsers();
    } catch (err: any) {
      message.error(err.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteUser(id);
      message.success('用户已删除');
      loadUsers();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (name: string) => (
        <Tag color="purple" style={{ fontSize: 13, padding: '2px 10px', fontFamily: 'monospace' }}>
          {name}
        </Tag>
      ),
    },
    {
      title: '用户 ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: 'monospace' }}>
          {id.slice(0, 8)}…
        </span>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (t: string) => new Date(t).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_: any, record: UserRow) => (
        <Space>
          <Tooltip title="编辑用户">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
              style={{ color: '#a855f7' }}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description={`将永久删除用户「${record.username}」及其所有数据，无法恢复。`}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
          >
            <Tooltip title="删除用户">
              <Button type="text" size="small" icon={<DeleteOutlined />} danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '8px', maxWidth: 900 }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 700 }} className="gradient-text">
            用户管理
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.45)', margin: '4px 0 0 0' }}>
            管理所有租户账号，可新建、编辑或删除用户。
          </Paragraph>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadUsers}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            className="glow-btn"
          >
            新建用户
          </Button>
        </Space>
      </div>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 位用户` }}
        style={{ background: 'transparent' }}
        className="glass-card"
      />

      <Modal
        title={
          <Space style={{ color: '#a855f7' }}>
            <TeamOutlined />
            <span>{editingUser ? '编辑用户' : '新建用户'}</span>
          </Space>
        }
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={editingUser ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={submitting}
        width={440}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username"
            label="用户名"
            rules={editingUser ? [] : [{ required: true, message: '请输入用户名' }]}
          >
            <Input
              placeholder={editingUser ? '留空则不修改用户名' : '请输入用户名'}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={editingUser ? [] : [{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              placeholder={editingUser ? '留空则不修改密码' : '请输入密码（至少6位）'}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
            />
          </Form.Item>
          <Button
            icon={<SyncOutlined />}
            onClick={handleRandomPassword}
            style={{
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              color: '#c084fc',
            }}
          >
            随机生成密码
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
