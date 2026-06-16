import { Card, Row, Col, Typography, Space } from 'antd';
import {
  BookOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';

const { Title, Paragraph } = Typography;

export default function Dashboard() {
  const { user } = useAuthStore();

  return (
    <div style={{ padding: '8px' }}>
      <div style={{ marginBottom: 32 }}>
        <Title level={2} style={{ margin: 0, fontWeight: 700 }} className="gradient-text">
          欢迎回来，{user?.username}！
        </Title>
        <Paragraph style={{ color: 'rgba(255, 255, 255, 0.45)', marginTop: 8 }}>
          这是您的私有云端开发空间。在这里，您可以安全地隔离运行 Claude Code 实例，配置个性化的自定义 Skills。
        </Paragraph>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} md={12} lg={8}>
          <Card
            bordered={false}
            className="glass-card"
            style={{ height: '100%' }}
            title={
              <Space style={{ color: '#c084fc' }}>
                <SafetyCertificateOutlined />
                <span>沙箱隔离</span>
              </Space>
            }
          >
            <Paragraph style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
              您的工作目录已严格绑定到项目根目录下的 <code>agent-dic/user/{user?.id}</code>。任何文件操作与 Claude 命令的启动都不会跨越您的专属沙箱目录。
            </Paragraph>
          </Card>
        </Col>

        <Col xs={24} md={12} lg={8}>
          <Card
            bordered={false}
            className="glass-card"
            style={{ height: '100%' }}
            title={
              <Space style={{ color: '#6366f1' }}>
                <BookOutlined />
                <span>实时 Skills</span>
              </Space>
            }
          >
            <Paragraph style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
              您可以在 Skills 管理页面配置自定义规则。每个 Skill 都是在该沙箱内的一个子文件夹，内置了 <code>CLAUDE.md</code> 指令，被 Claude Code 启动时实时扫描并加载。
            </Paragraph>
          </Card>
        </Col>

        <Col xs={24} md={12} lg={8}>
          <Card
            bordered={false}
            className="glass-card"
            style={{ height: '100%' }}
            title={
              <Space style={{ color: '#10b981' }}>
                <MessageOutlined />
                <span>我的开发会话</span>
              </Space>
            }
          >
            <Paragraph style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
              您可以通过新建不同的开发会话来执行各种开发任务，每个会话之间上下文独立，会话状态和执行历史在您的租户账号内完全安全隔离。
            </Paragraph>
          </Card>
        </Col>
      </Row>

      <Card
        bordered={false}
        className="glass-card"
        style={{ marginTop: 24, padding: '12px' }}
      >
        <Title level={4} style={{ marginTop: 0 }}>
          💡 快速上手流程
        </Title>
        <Paragraph style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
          1. <b>准备代码</b>：进入 <b>专属文件区</b> 创建文件夹并编写您的项目文件。<br />
          2. <b>编写规则</b>：在 <b>专属 Skills</b> 页面新建一个技术规范或命令快捷方式（即 <code>CLAUDE.md</code> 规则）。<br />
          3. <b>管理文件与规范</b>：在 <b>专属文件区</b> 放置您的代码，通过 <b>专属 Skills</b> 定义编码规范。<br />
          4. <b>开启会话开发</b>：进入 <b>我的会话</b> 并新建一个开发会话，向 Claude 发送自然语言指令，通过实时控制台查看 Claude 自动执行代码修改和构建！
        </Paragraph>
      </Card>
    </div>
  );
}
