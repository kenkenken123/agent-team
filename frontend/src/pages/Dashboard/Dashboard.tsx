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

const { RangePicker } = DatePicker;

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<OverviewStats | null>(null);
    const [agentUsage, setAgentUsage] = useState<import('../../types').AgentUsage[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs(), dayjs()]);

    const loadStats = (start: string, end: string) => {
        setLoading(true);
        Promise.all([
            statsApi.getOverview(start, end),
            statsApi.getAgentUsage(start, end)
        ]).then(([overview, agents]) => {
            setStats(overview);
            setAgentUsage(agents);
            setLoading(false);
        }).catch(err => {
            console.error('Failed to load dashboard stats', err);
            setLoading(false);
        });
    };

    useEffect(() => {
        loadStats(dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD'));
    }, [dateRange]);

    const formatNum = (n: number) => new Intl.NumberFormat().format(n);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <div className="title-section">
                    <h1>数据看板</h1>
                    <p>多实例 Claude Code 控制中心，实时掌握系统运行与资源消耗</p>
                </div>
                <div className="dashboard-filter">
                    <Space align="center" className="filter-box">
                        <span className="filter-label">统计范围:</span>
                        <RangePicker 
                            value={dateRange} 
                            onChange={(val) => val && val[0] && val[1] && setDateRange([val[0], val[1]])} 
                            allowClear={false}
                            className="dark-range-picker"
                            ranges={{
                                '今天': [dayjs(), dayjs()],
                                '最近 7 天': [dayjs().subtract(7, 'day'), dayjs()],
                                '本月': [dayjs().startOf('month'), dayjs().endOf('month')],
                            }}
                        />
                    </Space>
                </div>
            </div>

            {loading ? (
                <div className="dashboard-loading">
                    <Spin size="large" tip="加载统计数据中..." />
                </div>
            ) : (
                <div className="dashboard-content">
                    {/* 核心指标卡片 */}
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-header">
                                <span className="stat-label">活跃 AGENT 总数</span>
                                <RobotOutlined className="stat-icon" style={{ color: '#58A6FF' }} />
                            </div>
                            <div className="stat-value">{stats?.totalAgents ?? 0}</div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-header">
                                <span className="stat-label">当前运行中任务</span>
                                <ThunderboltOutlined className="stat-icon" style={{ color: '#58A6FF' }} />
                            </div>
                            <div className="stat-value">{stats?.runningTasks ?? 0}</div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-header">
                                <span className="stat-label">选定期间任务数</span>
                                <CalendarOutlined className="stat-icon" style={{ color: '#D29922' }} />
                            </div>
                            <div className="stat-value">{stats?.periodTasks ?? 0}</div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-header">
                                <span className="stat-label">选定期间 TOKEN 消耗</span>
                                <DeploymentUnitOutlined className="stat-icon" style={{ color: '#A371F7' }} />
                            </div>
                            <div className="stat-value">
                                {formatNum((stats?.periodInputTokens ?? 0) + (stats?.periodOutputTokens ?? 0) + (stats?.periodCacheReadTokens ?? 0) + (stats?.periodCacheCreationTokens ?? 0))}
                                <span className="stat-unit">tokens</span>
                            </div>
                        </div>
                    </div>

                    <div className="dashboard-detail-row">
                        {/* 消耗详情 */}
                        <div className="detail-card token-usage">
                            <div className="detail-header">Token 消耗详情</div>
                            <div className="usage-row">
                                <div className="usage-item">
                                    <div className="usage-label">输入 (Input)</div>
                                    <div className="usage-value input">{formatNum(stats?.periodInputTokens ?? 0)}</div>
                                </div>
                                <div className="usage-item">
                                    <div className="usage-label">输出 (Output)</div>
                                    <div className="usage-value output">{formatNum(stats?.periodOutputTokens ?? 0)}</div>
                                </div>
                                <div className="usage-item">
                                    <div className="usage-label">缓存读取 (Cache Read)</div>
                                    <div className="usage-value" style={{ color: '#A371F7' }}>{formatNum(stats?.periodCacheReadTokens ?? 0)}</div>
                                </div>
                                <div className="usage-item">
                                    <div className="usage-label">缓存创建 (Cache Create)</div>
                                    <div className="usage-value" style={{ color: '#D29922' }}>{formatNum(stats?.periodCacheCreationTokens ?? 0)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Agent 统计列表 */}
                        <div className="detail-card agent-usage-list">
                            <div className="detail-header">各 Agent 消耗排行</div>
                            <div className="agent-list-scroll">
                                {agentUsage.length === 0 ? (
                                    <div className="empty-list">期间无任务数据</div>
                                ) : (
                                    agentUsage.map(agent => (
                                        <div className="agent-usage-item" key={agent.agentId}>
                                            <div className="agent-info">
                                                <div className="agent-name">{agent.agentName}</div>
                                                <div className="agent-tasks">{agent.taskCount} 个任务</div>
                                            </div>
                                            <div className="agent-tokens">
                                                <div className="token-total">{formatNum(agent.totalTokens)}</div>
                                                <div className="token-breakdown">
                                                    In: {formatNum(agent.inputTokens)} | Out: {formatNum(agent.outputTokens)} | CacheR: {formatNum(agent.cacheReadTokens)} | CacheW: {formatNum(agent.cacheCreationTokens)}
                                                </div>
                                            </div>
                                            <div className="usage-progress-bar">
                                                <div 
                                                    className="fill" 
                                                    style={{ 
                                                        width: `${(agent.totalTokens / (agentUsage[0].totalTokens || 1)) * 100}%` 
                                                    }} 
                                                />
                                            </div>
                                        </div>
                                    ))
                                ) || <div className="empty-list">暂无任务数据</div>}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
