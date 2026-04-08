import React, { useEffect, useState, useCallback } from 'react';
import { Button, Space, Tag, Typography, Tooltip } from 'antd';
import {
  ExclamationCircleFilled,
  WarningFilled,
  InfoCircleFilled,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { WsPermissionRequestMessage, RiskLevel } from '../../types';

const { Text, Paragraph } = Typography;

interface PermissionDialogProps {
  request: WsPermissionRequestMessage;
  onDecide: (requestId: string, decision: 'allow' | 'deny') => void;
  timeoutSeconds?: number;
}

const RISK_CONFIG: Record<RiskLevel, {
  icon: React.ReactNode;
  label: string;
  color: string;
  borderColor: string;
  bgColor: string;
  tagColor: string;
}> = {
  High: {
    icon: <ExclamationCircleFilled />,
    label: '高风险操作',
    color: '#F85149',
    borderColor: '#6E2A2A',
    bgColor: 'rgba(248, 81, 73, 0.05)',
    tagColor: 'error',
  },
  Medium: {
    icon: <WarningFilled />,
    label: '需要确认',
    color: '#E3B341',
    borderColor: '#5A4A1E',
    bgColor: 'rgba(227, 179, 65, 0.05)',
    tagColor: 'warning',
  },
  Low: {
    icon: <InfoCircleFilled />,
    label: '低风险',
    color: '#58A6FF',
    borderColor: '#1F3A5F',
    bgColor: 'rgba(88, 166, 255, 0.05)',
    tagColor: 'processing',
  },
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  Bash: '执行 Shell 命令',
  Write: '写入文件内容',
  Edit: '编辑文件',
  MultiEdit: '批量编辑文件',
  Read: '读取文件',
  Grep: '搜索文件内容',
  Glob: '查找文件',
  WebFetch: '访问网络资源',
  WebSearch: '执行网络搜索',
  MCP__: '调用 MCP 工具',
};

const PermissionDialog: React.FC<PermissionDialogProps> = ({
  request,
  onDecide,
  timeoutSeconds = 60,
}) => {
  const [remaining, setRemaining] = useState(timeoutSeconds);
  const [decided, setDecided] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const risk = RISK_CONFIG[request.riskLevel] ?? RISK_CONFIG.Medium;
  const toolDesc = Object.entries(TOOL_DESCRIPTIONS).find(([key]) =>
    request.toolName.startsWith(key)
  )?.[1] ?? '调用工具';

  // 倒计时
  useEffect(() => {
    if (decided) return;
    const timer = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleDecide('deny');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [decided]);

  const handleDecide = useCallback((decision: 'allow' | 'deny') => {
    if (decided) return;
    setDecided(true);
    onDecide(request.requestId, decision);
  }, [decided, onDecide, request.requestId]);

  const progressPercent = (remaining / timeoutSeconds) * 100;
  const isUrgent = remaining <= 10;

  return (
    <div style={{
      background: '#161B22',
      border: `1px solid ${risk.borderColor}`,
      borderLeft: `3px solid ${risk.color}`,
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 12,
      boxShadow: `0 0 20px rgba(0,0,0,0.4), 0 0 0 1px ${risk.borderColor}`,
      animation: 'permissionSlideIn 0.3s ease',
      background: risk.bgColor,
    }}>
      {/* ── 头部 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <Space size={8} align="center">
          <span style={{ color: risk.color, fontSize: 16 }}>{risk.icon}</span>
          <Text strong style={{ color: '#C9D1D9', fontSize: 14 }}>
            🔐 Claude 请求授权
          </Text>
          <Tag color={risk.tagColor} style={{ fontSize: 11, margin: 0 }}>
            {risk.label}
          </Tag>
        </Space>

        {/* 倒计时 */}
        <Space size={4} align="center">
          <ClockCircleOutlined style={{ color: isUrgent ? '#F85149' : '#8B949E', fontSize: 12 }} />
          <Text style={{
            color: isUrgent ? '#F85149' : '#8B949E',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: isUrgent ? 'bold' : 'normal',
          }}>
            {remaining}s
          </Text>
        </Space>
      </div>

      {/* 进度条 */}
      <div style={{
        height: 2,
        background: '#30363D',
        borderRadius: 1,
        marginBottom: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${progressPercent}%`,
          background: isUrgent ? '#F85149' : risk.color,
          borderRadius: 1,
          transition: 'width 1s linear, background 0.3s ease',
        }} />
      </div>

      {/* ── 工具信息 ── */}
      <div style={{ marginBottom: 10 }}>
        <Space size={6}>
          <CodeOutlined style={{ color: '#8B949E', fontSize: 12 }} />
          <Text style={{ color: '#8B949E', fontSize: 12 }}>操作:</Text>
          <Tag style={{
            background: '#21262D',
            borderColor: '#30363D',
            color: '#58A6FF',
            fontFamily: 'monospace',
            fontSize: 12,
          }}>
            {request.toolName}
          </Tag>
          <Text style={{ color: '#8B949E', fontSize: 12 }}>— {toolDesc}</Text>
        </Space>
      </div>

      {/* ── 操作展示 ── */}
      <div style={{
        background: '#0D1117',
        border: '1px solid #30363D',
        borderRadius: 6,
        padding: '10px 12px',
        marginBottom: 12,
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: 13,
        color: '#E6EDF3',
        maxHeight: 100,
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}>
        {request.inputDisplay}
      </div>

      {/* 展开原始 JSON */}
      {request.rawInput && request.rawInput !== '{}' && (
        <div style={{ marginBottom: 12 }}>
          <Button
            type="link"
            size="small"
            style={{ color: '#8B949E', padding: 0, fontSize: 11 }}
            onClick={() => setShowRaw(v => !v)}
          >
            {showRaw ? '▲ 收起完整参数' : '▼ 查看完整参数'}
          </Button>
          {showRaw && (
            <div style={{
              background: '#0D1117',
              border: '1px dashed #30363D',
              borderRadius: 6,
              padding: '8px 12px',
              marginTop: 6,
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#8B949E',
              maxHeight: 150,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {(() => { try { return JSON.stringify(JSON.parse(request.rawInput), null, 2); } catch { return request.rawInput; } })()}
            </div>
          )}
        </div>
      )}

      {/* ── 操作按钮 ── */}
      {!decided ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button
            size="small"
            icon={<CloseCircleOutlined />}
            onClick={() => handleDecide('deny')}
            style={{
              background: 'transparent',
              borderColor: '#6E7681',
              color: '#8B949E',
            }}
          >
            拒绝
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => handleDecide('allow')}
            style={{
              background: request.riskLevel === 'High' ? '#DA3633' : '#238636',
              borderColor: request.riskLevel === 'High' ? '#DA3633' : '#2EA043',
            }}
          >
            {request.riskLevel === 'High' ? '⚠️ 确认允许（高风险）' : '允许执行'}
          </Button>
        </div>
      ) : (
        <div style={{ textAlign: 'right' }}>
          <Text style={{ color: '#8B949E', fontSize: 12 }}>
            {remaining === 0 ? '⏱ 超时自动拒绝' : '✅ 决定已提交，等待 Claude 继续...'}
          </Text>
        </div>
      )}
    </div>
  );
};

export default PermissionDialog;
