import React from 'react';
import { Card, Typography, Space, Row, Col } from 'antd';
import {
  RobotOutlined,
  KeyOutlined,
  RightOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../stores/appStore';
import './SystemManagement.css';

const { Title, Paragraph, Text } = Typography;

const SystemManagementPage: React.FC = () => {
  const { setPage } = useAppStore();

  const subMenus = [
    {
      key: 'agents' as const,
      icon: <RobotOutlined style={{ fontSize: 32, color: '#58A6FF' }} />,
      title: 'Agent 管理',
      description: '管理 Claude Code Agent 模板、配置与运行状态',
    },
    {
      key: 'config' as const,
      icon: <KeyOutlined style={{ fontSize: 32, color: '#BC8CFF' }} />,
      title: 'API 凭据管理',
      description: '管理 API Key、Endpoint 等认证凭据',
    },
  ];

  return (
    <div className="system-management-page">
      <div className="system-management-header">
        <Title level={3}>
          <SettingOutlined /> 系统管理
        </Title>
        <Paragraph style={{ color: '#8B949E' }}>
          管理系统核心配置，包括 Agent 模板与 API 凭据。
        </Paragraph>
      </div>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row gutter={[24, 24]}>
          {subMenus.map((item) => (
            <Col xs={24} sm={12} key={item.key}>
              <Card
                hoverable
                className="system-management-card"
                onClick={() => setPage(item.key)}
              >
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  {item.icon}
                  <div className="system-management-card-content">
                    <Text strong style={{ fontSize: 18, color: '#F0F6FC' }}>
                      {item.title}
                    </Text>
                    <Paragraph style={{ color: '#8B949E', margin: '4px 0 0 0' }}>
                      {item.description}
                    </Paragraph>
                  </div>
                  <RightOutlined style={{ color: '#484F58' }} />
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Space>
    </div>
  );
};

export default SystemManagementPage;
