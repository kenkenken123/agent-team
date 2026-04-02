import React, { useRef, useEffect } from 'react';
import { Button, Tooltip } from 'antd';
import { ReloadOutlined, FullscreenOutlined } from '@ant-design/icons';
import { usePtyTerminal } from '../../hooks/usePtyTerminal';
import type { PtyStatus } from '../../hooks/usePtyTerminal';

interface RealTerminalProps {
  active: boolean;
  cwd?: string;
  initialCommand?: string;
}

const STATUS_CONFIG: Record<PtyStatus, { color: string; label: string; glow: boolean }> = {
  disconnected: { color: '#484F58', label: '未连接',   glow: false },
  connecting:   { color: '#D29922', label: '连接中...', glow: true  },
  connected:    { color: '#3FB950', label: '已连接',   glow: true  },
  error:        { color: '#F85149', label: '连接错误', glow: false },
};

const RealTerminal: React.FC<RealTerminalProps> = ({ active, cwd, initialCommand }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { status, fit, reconnect } = usePtyTerminal(containerRef, active, cwd, initialCommand);
  const cfg = STATUS_CONFIG[status];

  // 展开时 fit 终端
  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => fit(), 80);
      return () => clearTimeout(timer);
    }
  }, [active, fit]);

  return (
    <div className="pty-terminal-wrapper">
      {/* 状态栏 */}
      <div className="pty-status-bar">
        <div className="pty-status-left">
          <span
            className={`pty-dot ${cfg.glow ? 'pty-dot-glow' : ''}`}
            style={{ backgroundColor: cfg.color, boxShadow: cfg.glow ? `0 0 6px ${cfg.color}` : 'none' }}
          />
          <span className="pty-status-label">{cfg.label}</span>
          <span className="pty-status-tip">PowerShell · ws/terminal</span>
        </div>
        <div className="pty-status-right">
          <Tooltip title="重新连接">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={reconnect}
              className="term-icon-btn"
              disabled={status === 'connecting'}
            />
          </Tooltip>
          <Tooltip title="自适应大小">
            <Button
              type="text"
              size="small"
              icon={<FullscreenOutlined />}
              onClick={fit}
              className="term-icon-btn"
            />
          </Tooltip>
        </div>
      </div>

      {/* xterm 容器 */}
      <div className="pty-xterm-container" ref={containerRef} />

      {/* 未连接时的占位提示 */}
      {status === 'disconnected' && (
        <div className="pty-disconnected-overlay">
          <div className="pty-disconnected-icon">⬡</div>
          <p>终端未连接</p>
          <Button type="primary" size="small" onClick={reconnect} icon={<ReloadOutlined />}>
            连接终端
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div className="pty-disconnected-overlay pty-error-overlay">
          <div className="pty-disconnected-icon">✕</div>
          <p>连接失败，请确认后端已启动</p>
          <Button type="primary" size="small" danger onClick={reconnect} icon={<ReloadOutlined />}>
            重试
          </Button>
        </div>
      )}
    </div>
  );
};

export default RealTerminal;
