import { useState, useEffect } from 'react';
import { Card, Button, Input, Modal, Form, Row, Col, Space, Typography, message, Popconfirm } from 'antd';
import { BookOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { skillsApi } from '../../api/saasApi';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

interface Skill {
  skillName: string;
  description: string;
  createdAt: string;
}

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [currentSkill, setCurrentSkill] = useState<Skill | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [form] = Form.useForm();

  const loadSkills = async () => {
    setLoading(true);
    try {
      const data = await skillsApi.getSkills();
      setSkills(data);
    } catch (err: any) {
      message.error(err.message || '加载 Skills 失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      await skillsApi.createSkill({
        skillName: values.skillName,
        description: values.description || '',
      });
      message.success('创建 Skill 成功');
      setCreateVisible(false);
      form.resetFields();
      loadSkills();
    } catch (err: any) {
      message.error(err.message || '创建失败');
    }
  };

  const handleEditOpen = async (skill: Skill) => {
    setCurrentSkill(skill);
    try {
      const res = await skillsApi.getSkillContent(skill.skillName);
      setEditorContent(res.content || '');
      setEditVisible(true);
    } catch (err: any) {
      message.error(err.message || '加载 Skill 详情失败');
    }
  };

  const handleSaveContent = async () => {
    if (!currentSkill) return;
    try {
      await skillsApi.updateSkillContent(currentSkill.skillName, {
        description: editorContent,
      });
      message.success('保存成功');
      setEditVisible(false);
      loadSkills();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await skillsApi.deleteSkill(name);
      message.success('删除成功');
      loadSkills();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  return (
    <div style={{ padding: '8px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 700 }} className="gradient-text">
            专属 Skills 技能
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.45)', margin: '8px 0 0 0' }}>
            在这里定义的 Skills 会实时作为 <code>.claude/skills/{"{skillName}"}/CLAUDE.md</code> 文件夹规则创建，供 Claude 启动时加载。
          </Paragraph>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateVisible(true)}
          className="glow-btn"
        >
          新建 Skill
        </Button>
      </div>

      <Row gutter={[24, 24]}>
        {skills.map((skill) => (
          <Col xs={24} sm={12} lg={8} key={skill.skillName}>
            <Card
              bordered={false}
              className="glass-card"
              style={{ position: 'relative' }}
              actions={[
                <EditOutlined key="edit" onClick={() => handleEditOpen(skill)} />,
                <Popconfirm
                  title="确认删除该 Skill 吗？"
                  description="这将彻底删除该 Skill 的物理文件夹。"
                  onConfirm={() => handleDelete(skill.skillName)}
                  okText="确认"
                  cancelText="取消"
                >
                  <DeleteOutlined key="delete" style={{ color: '#ff4d4f' }} />
                </Popconfirm>,
              ]}
            >
              <div style={{
                position: 'absolute',
                top: 16,
                right: 16,
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 8px #10b981',
              }} />
              <Card.Meta
                avatar={<BookOutlined style={{ fontSize: 24, color: '#a855f7' }} />}
                title={skill.skillName}
                description={
                  <div style={{ height: 60, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {skill.description || <span style={{ color: 'rgba(255,255,255,0.25)' }}>(暂无规则描述)</span>}
                  </div>
                }
              />
              <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>
                创建时间: {new Date(skill.createdAt).toLocaleString()}
              </div>
            </Card>
          </Col>
        ))}
        {skills.length === 0 && !loading && (
          <div style={{ width: '100%', padding: '48px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>
            没有找到任何 Skills，点击右上方「新建 Skill」开始创建。
          </div>
        )}
      </Row>

      <Modal
        title="新建 Custom Skill"
        open={createVisible}
        onCancel={() => setCreateVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item
            name="skillName"
            label="Skill 目录名称"
            rules={[
              { required: true, message: '请输入 Skill 名称' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: '仅支持英文字母、数字、下划线及连字符' },
            ]}
          >
            <Input placeholder="例如: web-builder" />
          </Form.Item>
          <Form.Item
            name="description"
            label="CLAUDE.md 内容"
            help="这通常包含开发规范、工具指令或者 Claude 的系统上下文指引"
          >
            <TextArea rows={8} placeholder="# CLAUDE.md&#10;&#10;## Build Instructions&#10;- Build: npm run build&#10;- Test: npm test" />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setCreateVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit" className="glow-btn">
                创建
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`编辑 Skill: ${currentSkill?.skillName}`}
        open={editVisible}
        onCancel={() => setEditVisible(false)}
        width={720}
        onOk={handleSaveContent}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ className: 'glow-btn' }}
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 8, color: 'rgba(255,255,255,0.45)' }}>
            实时编辑该 Skill 目录下的 <code>CLAUDE.md</code> 指令：
          </div>
          <TextArea
            rows={16}
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 13, background: '#090a0f', color: '#87d068' }}
          />
        </div>
      </Modal>
    </div>
  );
}
