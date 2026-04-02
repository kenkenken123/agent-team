import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { 
  RobotOutlined, 
  ThunderboltOutlined, 
  CalendarOutlined, 
  DeploymentUnitOutlined 
} from '@ant-design/icons';
import { statsApi } from '../../api/statsApi';
import type { OverviewStats } from '../../types';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<OverviewStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        statsApi.getOverview().then(data => {
            setStats(data);
            setLoading(false);
        }).catch(err => {
            console.error('Failed to load dashboard stats', err);
            setLoading(false);
        });
    }, []);

    const formatNum = (n: number) => new Intl.NumberFormat().format(n);

    if (loading) return (
        <div className="dashboard-loading">
            <Spin size="large" tip="Loading Stats..." />
        </div>
    );

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Agent Team</h1>
                <p>Multi-Claude Code Instance Control Center</p>
            </div>

            {/* 顶栏卡片组 */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-header">
                        <span className="stat-label">Active Agents</span>
                        <RobotOutlined className="stat-icon" />
                    </div>
                    <div className="stat-value">{stats?.totalAgents ?? 0}</div>
                </div>

                <div className="stat-card">
                    <div className="stat-header">
                        <span className="stat-label">Running Tasks</span>
                        <ThunderboltOutlined className="stat-icon" style={{color: '#bc8cff'}} />
                    </div>
                    <div className="stat-value">{stats?.runningTasks ?? 0}</div>
                </div>

                <div className="stat-card">
                    <div className="stat-header">
                        <span className="stat-label">Today's Tasks</span>
                        <CalendarOutlined className="stat-icon" style={{color: '#ffd33d'}} />
                    </div>
                    <div className="stat-value">{stats?.todayTasks ?? 0}</div>
                </div>

                <div className="stat-card">
                    <div className="stat-header">
                        <span className="stat-label">Today's Consumption</span>
                        <DeploymentUnitOutlined className="stat-icon" style={{color: '#bc8ff2'}} />
                    </div>
                    <div className="stat-value">
                        {formatNum((stats?.todayInputTokens ?? 0) + (stats?.todayOutputTokens ?? 0))}
                        <span className="stat-unit">tokens</span>
                    </div>
                </div>
            </div>

            {/* 详情卡片 */}
            <div className="detail-card">
                <div className="detail-header">Token Usage Details (Today)</div>
                <div className="usage-row">
                    <div className="usage-item">
                        <div className="usage-label">Input Tokens</div>
                        <div className="usage-value input">{formatNum(stats?.todayInputTokens ?? 0)}</div>
                    </div>
                    <div className="usage-item">
                        <div className="usage-label">Output Tokens</div>
                        <div className="usage-value output">{formatNum(stats?.todayOutputTokens ?? 0)}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
