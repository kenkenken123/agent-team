import React, { useEffect, useState } from 'react';
import { Spin, DatePicker, Space } from 'antd';
import dayjs from 'dayjs';
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
    const [selectedDate, setSelectedDate] = useState(dayjs());

    const loadStats = (dateStr?: string) => {
        setLoading(true);
        statsApi.getOverview(dateStr).then(data => {
            setStats(data);
            setLoading(false);
        }).catch(err => {
            console.error('Failed to load dashboard stats', err);
            setLoading(false);
        });
    };

    useEffect(() => {
        loadStats(selectedDate.format('YYYY-MM-DD'));
    }, [selectedDate]);

    const formatNum = (n: number) => new Intl.NumberFormat().format(n);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Agent Team</h1>
                    <p>Multi-Claude Code Instance Control Center</p>
                </div>
                <div className="dashboard-filter">
                    <Space align="center" style={{ background: '#161B22', padding: '8px 16px', borderRadius: 8, border: '1px solid #30363D' }}>
                        <span style={{ color: '#8B949E' }}>统计日期:</span>
                        <DatePicker 
                            value={selectedDate} 
                            onChange={(val) => val && setSelectedDate(val)} 
                            allowClear={false}
                            style={{ background: '#0D1117', border: '1px solid #30363D', color: '#C9D1D9' }}
                        />
                    </Space>
                </div>
            </div>

            {loading ? (
                <div className="dashboard-loading" style={{ height: '300px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <Spin size="large" tip="Loading Stats..." />
                </div>
            ) : (
                <>
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
                                <span className="stat-label">{selectedDate.isSame(dayjs(), 'day') ? "Today's Tasks" : "Tasks on " + selectedDate.format('MM-DD')}</span>
                                <CalendarOutlined className="stat-icon" style={{color: '#ffd33d'}} />
                            </div>
                            <div className="stat-value">{stats?.todayTasks ?? 0}</div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-header">
                                <span className="stat-label">{selectedDate.isSame(dayjs(), 'day') ? "Today's Consumption" : "Consumption on " + selectedDate.format('MM-DD')}</span>
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
                        <div className="detail-header">Token Usage Details ({selectedDate.format('YYYY-MM-DD')})</div>
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
                </>
            )}
        </div>
    );
};

export default Dashboard;
