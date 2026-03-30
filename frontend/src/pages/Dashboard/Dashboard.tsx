import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Spin, Typography, Badge } from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  CalendarOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { statsApi } from '../../api/taskApi';
import type { OverviewStats } from '../../types';
import './Dashboard.css';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await statsApi.overview();
      setStats(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-title-area">
          <Title level={2} style={{ margin: 0, color: '#F0F6FC' }}>
            Agent Team
          </Title>
          <Text style={{ color: '#8B949E', marginTop: 4, display: 'block' }}>
            多 Claude Code 实例控制中心
          </Text>
        </div>
        {stats?.runningTasks ? (
          <Badge
            count={`${stats.runningTasks} 个任务运行中`}
            style={{ backgroundColor: '#238636', fontSize: 13, padding: '2px 10px' }}
          />
        ) : null}
      </div>

      <Spin spinning={loading}>
        <Row gutter={[16, 16]} className="stats-row">
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic
                title={<span className="stat-label">活跃 Agent</span>}
                value={stats?.totalAgents ?? 0}
                prefix={<RobotOutlined className="stat-icon agent-icon" />}
                valueStyle={{ color: '#58A6FF' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic
                title={<span className="stat-label">正在运行</span>}
                value={stats?.runningTasks ?? 0}
                prefix={<ThunderboltOutlined className="stat-icon running-icon" />}
                valueStyle={{ color: '#3FB950' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic
                title={<span className="stat-label">今日任务</span>}
                value={stats?.todayTasks ?? 0}
                prefix={<CalendarOutlined className="stat-icon today-icon" />}
                valueStyle={{ color: '#D29922' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic
                title={<span className="stat-label">今日 Token 消耗</span>}
                value={(stats?.todayInputTokens ?? 0) + (stats?.todayOutputTokens ?? 0)}
                prefix={<ApiOutlined className="stat-icon token-icon" />}
                valueStyle={{ color: '#BC8CFF' }}
                formatter={(val) => val.toLocaleString()}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card className="info-card" title={<span style={{ color: '#C9D1D9' }}>Token 用量详情（今日）</span>}>
              <Row gutter={32}>
                <Col>
                  <Text style={{ color: '#8B949E' }}>输入 Token</Text>
                  <div style={{ color: '#79C0FF', fontSize: 24, fontWeight: 600, marginTop: 4 }}>
                    {(stats?.todayInputTokens ?? 0).toLocaleString()}
                  </div>
                </Col>
                <Col>
                  <Text style={{ color: '#8B949E' }}>输出 Token</Text>
                  <div style={{ color: '#56D364', fontSize: 24, fontWeight: 600, marginTop: 4 }}>
                    {(stats?.todayOutputTokens ?? 0).toLocaleString()}
                  </div>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
};

export default Dashboard;
