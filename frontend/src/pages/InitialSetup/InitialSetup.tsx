import React, { useState } from 'react';
import { Typography, Card, Space, Divider, Tag, Button, Input } from 'antd';
import {
  NodeIndexOutlined,
  GitlabOutlined,
  CloudDownloadOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  ArrowDownOutlined,
  RightOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import './InitialSetup.css';

const { Title, Paragraph, Text } = Typography;

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      type="text"
      size="small"
      icon={copied ? <CheckCircleOutlined style={{ color: '#3FB950' }} /> : <CopyOutlined />}
      onClick={handleCopy}
      style={{ marginLeft: 8 }}
    />
  );
};

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code }) => (
  <div className="code-block">
    <pre className="code-text">
      <code>{code}</code>
    </pre>
    <CopyButton text={code} />
  </div>
);

const StepNumber: React.FC<{ num: number }> = ({ num }) => (
  <div className="step-number">
    {num}
  </div>
);

const InitialSetupPage: React.FC = () => (
  <div className="initial-setup-page">
    {/* Header */}
    <div className="setup-header">
      <ThunderboltOutlined className="header-icon" />
      <Title level={3} className="header-title">初始环境配置</Title>
      <Paragraph className="header-desc">
        完成以下三个阶段的安装，即可在 Agent Team 中运行 Claude Code。
      </Paragraph>
    </div>

    <Space direction="vertical" size="large" className="setup-steps">

      {/* ===== Phase 1: Node.js ===== */}
      <Card className="setup-card" size="default">
        <div className="setup-card-header">
          <StepNumber num={1} />
          <div className="setup-card-title">
            <div className="setup-card-title-row">
              <NodeIndexOutlined style={{ fontSize: 20, color: '#3FB950' }} />
              <Text strong className="phase-title">第一阶段：安装 Node.js</Text>
              <Tag color="green">必需</Tag>
            </div>
            <Text className="phase-subtitle">
              Claude Code 是基于 Node.js 运行的，这是第一步。
            </Text>
          </div>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <div className="step-section">
          <div className="step-item">
            <div className="step-label">1. 下载 Node.js</div>
            <Paragraph className="step-desc">
              访问 <Text code>nodejs.org</Text>，点击下载 <Tag color="green">LTS</Tag>（Long Term Support）版本。
            </Paragraph>
            <div className="step-tip">
              <ArrowDownOutlined /> 建议选择左边的 LTS 按钮
            </div>
          </div>

          <div className="step-item">
            <div className="step-label">2. 安装程序</div>
            <Paragraph className="step-desc">
              运行下载的 <Text code>.msi</Text> 文件。在安装过程中，<Text strong style={{ color: '#F0F6FC' }}>务必勾选</Text>「Automatically install the necessary tools... (Chocolatey)」。虽然不是强制的，但对后续安装 C++ 编译环境很有帮助。
            </Paragraph>
          </div>

          <div className="step-item">
            <div className="step-label">3. 验证安装</div>
            <Paragraph className="step-desc">
              按下 <Tag color="blue">Win + X</Tag> 键，选择「终端 (管理员)」或「PowerShell (管理员)」，输入：
            </Paragraph>
            <CodeBlock code="node -v" />
            <CodeBlock code="npm -v" />
            <div className="step-tip">
              看到版本号（如 <Text code style={{ color: '#3FB950' }}>v20.x.x</Text>）即表示成功。
            </div>
          </div>
        </div>
      </Card>

      {/* ===== Phase 2: Git ===== */}
      <Card className="setup-card" size="default">
        <div className="setup-card-header">
          <StepNumber num={2} />
          <div className="setup-card-title">
            <div className="setup-card-title-row">
              <GitlabOutlined style={{ fontSize: 20, color: '#F0883E' }} />
              <Text strong className="phase-title">第二阶段：安装 Git</Text>
              <Tag color="orange">必需</Tag>
            </div>
            <Text className="phase-subtitle">
              Claude Code 依赖 Git 来读取代码历史和执行 claude commit。
            </Text>
          </div>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <div className="step-section">
          <div className="step-item">
            <div className="step-label">1. 下载 Git</div>
            <Paragraph className="step-desc">
              访问 <Text code>git-scm.com</Text>，下载 Windows 安装包。
            </Paragraph>
          </div>

          <div className="step-item">
            <div className="step-label">2. 安装</div>
            <Paragraph className="step-desc">
              保持默认设置即可，但确保在 <Text strong style={{ color: '#F0F6FC' }}>「Adjusting your PATH environment」</Text> 步骤中选择了 <Text code style={{ color: '#F0F6FC' }}>Git from the command line and also from 3rd-party software</Text>。
            </Paragraph>
          </div>

          <div className="step-item">
            <div className="step-label">3. 验证</div>
            <Paragraph className="step-desc">
              在终端输入：
            </Paragraph>
            <CodeBlock code="git --version" />
          </div>
        </div>
      </Card>

      {/* ===== Phase 3: Claude Code ===== */}
      <Card className="setup-card" size="default">
        <div className="setup-card-header">
          <StepNumber num={3} />
          <div className="setup-card-title">
            <div className="setup-card-title-row">
              <CloudDownloadOutlined style={{ fontSize: 20, color: '#58A6FF' }} />
              <Text strong className="phase-title">第三阶段：安装 Claude Code</Text>
              <Tag color="blue">核心</Tag>
            </div>
            <Text className="phase-subtitle">
              完成前两步后，安装 Claude Code CLI 工具。
            </Text>
          </div>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <div className="step-section">
          <div className="step-item">
            <div className="step-label">1. 安装命令</div>
            <Paragraph className="step-desc">
              在终端（管理员模式）中输入以下命令进行全局安装：
            </Paragraph>
            <CodeBlock code="npm install -g @anthropic-ai/claude-code" />
          </div>

          <div className="step-item">
            <div className="step-label">2. 登录认证</div>
            <Paragraph className="step-desc">
              安装完成后，运行 <Text code>claude</Text> 命令，按照提示完成 Anthropic 账号登录。
            </Paragraph>
          </div>

          <Divider style={{ margin: '24px 0' }} />

          <div className="china-tip">
            <Text strong style={{ color: '#F0883E' }}>💡 中国用户提示</Text>
            <Paragraph className="step-desc" style={{ marginTop: 8 }}>
              中国用户可以使用 <Text code style={{ color: '#58A6FF' }}>ccswitch</Text> 去配置 Claude Code 的模型使用，以获得更稳定的体验。
            </Paragraph>
          </div>
        </div>
      </Card>

      {/* Done card */}
      <Card className="setup-card setup-done" size="default">
        <div className="done-content">
          <CheckCircleOutlined style={{ fontSize: 28, color: '#3FB950' }} />
          <div>
            <Text strong style={{ fontSize: 16, color: '#F0F6FC' }}>完成 🎉</Text>
            <Paragraph style={{ color: '#8B949E', margin: '4px 0 0 0' }}>
              完成以上三步后，重启 Agent Team 即可开始使用 Claude Code Agent。
            </Paragraph>
          </div>
        </div>
      </Card>

    </Space>
  </div>
);

export default InitialSetupPage;
