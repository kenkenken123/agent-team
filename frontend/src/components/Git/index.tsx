import React, { useState, useEffect, useRef } from 'react';
import { Drawer, List, Typography, Space, Button, Modal, Spin, Tag, Input, message, Alert } from 'antd';
import { ReloadOutlined, FileTextOutlined, BranchesOutlined, ScanOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { gitApi } from '../../api/gitApi';
import type { GitStatusInfo, GitFileStatus } from '../../api/gitApi';
import './index.css';

const { Text } = Typography;
const { TextArea } = Input;

// ============ Unified Diff → Side-by-Side Parser ============

interface DiffLine {
  num: string;
  text: string;
  type: 'context' | 'added' | 'removed' | 'empty';
}

interface DiffRow {
  left: DiffLine;
  right: DiffLine;
  type: 'context' | 'added' | 'removed' | 'header';
}

function parseUnifiedDiff(diff: string): DiffRow[] {
  const lines = diff.split('\n');
  const rows: DiffRow[] = [];
  let i = 0;

  const headerLines: string[] = [];
  while (i < lines.length && !lines[i].startsWith('@@')) {
    headerLines.push(lines[i]);
    i++;
  }
  if (headerLines.length > 0) {
    rows.push({
      left: { num: '', text: headerLines.join('\n'), type: 'context' },
      right: { num: '', text: '', type: 'empty' },
      type: 'header',
    });
  }

  let leftNum = 0;
  let rightNum = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        leftNum = parseInt(match[1]) - 1;
        rightNum = parseInt(match[2]) - 1;
      }
      rows.push({
        left: { num: '', text: line, type: 'context' },
        right: { num: '', text: '', type: 'empty' },
        type: 'header',
      });
      i++;
      continue;
    }

    if (line.startsWith('+')) {
      rightNum++;
      rows.push({
        left: { num: '', text: '', type: 'empty' },
        right: { num: String(rightNum), text: line.substring(1), type: 'added' },
        type: 'added',
      });
    } else if (line.startsWith('-')) {
      leftNum++;
      rows.push({
        left: { num: String(leftNum), text: line.substring(1), type: 'removed' },
        right: { num: '', text: '', type: 'empty' },
        type: 'removed',
      });
    } else if (line.startsWith('\\')) {
      i++;
      continue;
    } else {
      leftNum++;
      rightNum++;
      rows.push({
        left: { num: String(leftNum), text: line.substring(1), type: 'context' },
        right: { num: String(rightNum), text: line.substring(1), type: 'context' },
        type: 'context',
      });
    }
    i++;
  }

  return rows;
}

// ============ Diff Modal Component ============

interface DiffModalProps {
  open: boolean;
  file: string;
  diffText: string;
  loading: boolean;
  onClose: () => void;
}

const DiffModal: React.FC<DiffModalProps> = ({ open, file, diffText, loading, onClose }) => {
  const rows = diffText ? parseUnifiedDiff(diffText) : [];
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  // Sync both horizontal and vertical scroll between left and right panels
  useEffect(() => {
    const leftEl = leftRef.current;
    const rightEl = rightRef.current;
    if (!leftEl || !rightEl) return;

    const onLeftScroll = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      rightEl.scrollLeft = leftEl.scrollLeft;
      rightEl.scrollTop = leftEl.scrollTop;
      requestAnimationFrame(() => { isSyncingRef.current = false; });
    };

    const onRightScroll = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      leftEl.scrollLeft = rightEl.scrollLeft;
      leftEl.scrollTop = rightEl.scrollTop;
      requestAnimationFrame(() => { isSyncingRef.current = false; });
    };

    leftEl.addEventListener('scroll', onLeftScroll);
    rightEl.addEventListener('scroll', onRightScroll);

    return () => {
      leftEl.removeEventListener('scroll', onLeftScroll);
      rightEl.removeEventListener('scroll', onRightScroll);
    };
  }, [rows]);

  const renderLine = (line: DiffLine, side: 'left' | 'right') => (
    <div className={`diff-line ${line.type === 'added' ? 'added' : line.type === 'removed' ? 'removed' : line.type === 'empty' ? 'empty' : ''}`}>
      <span className={`diff-line-num ${line.type === 'added' ? 'added' : line.type === 'removed' ? 'removed' : line.type === 'empty' ? 'dim' : ''}`}>
        {line.num}
      </span>
      <span className="diff-line-text">{line.text || '\u00a0'}</span>
    </div>
  );

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      width="92vw"
      closable
      maskClosable
      style={{ top: 20 }}
      styles={{ body: { padding: 0, backgroundColor: '#0D1117', overflow: 'hidden' } }}
      className="diff-modal"
    >
      <div className="diff-modal-header">
        <div className="diff-file-path">
          <FileTextOutlined className="diff-file-icon" />
          <span className="diff-file-name">{file}</span>
        </div>
      </div>
      <div className="diff-tab-bar">
        <div className="diff-tab diff-tab-original">ORIGINAL</div>
        <div className="diff-tab-divider" />
        <div className="diff-tab diff-tab-modified">MODIFIED</div>
      </div>
      <Spin spinning={loading}>
        {diffText && rows.length > 0 ? (
          <div className="side-by-side-diff">
            {/* LEFT PANEL */}
            <div className="diff-panel diff-panel-left" ref={leftRef}>
              <div className="diff-panel-content">
                {rows.map((row, idx) => {
                  if (row.type === 'header') {
                    return (
                      <div key={idx} className="diff-line diff-header-line">
                        <pre className="diff-header-text">{row.left.text}</pre>
                      </div>
                    );
                  }
                  return <div key={idx}>{renderLine(row.left, 'left')}</div>;
                })}
              </div>
            </div>

            {/* GUTTER */}
            <div className="diff-gutter" />

            {/* RIGHT PANEL */}
            <div className="diff-panel diff-panel-right" ref={rightRef}>
              <div className="diff-panel-content">
                {rows.map((row, idx) => {
                  if (row.type === 'header') {
                    return (
                      <div key={idx} className="diff-line diff-header-line">
                        <pre className="diff-header-text">{row.left.text}</pre>
                      </div>
                    );
                  }
                  return <div key={idx}>{renderLine(row.right, 'right')}</div>;
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="diff-empty" style={{ padding: 40, textAlign: 'center', color: '#8B949E' }}>
            No diff content
          </div>
        )}
      </Spin>
    </Modal>
  );
};

// ============ Main Drawer ============

interface GitDrawerProps {
  visible: boolean;
  onClose: () => void;
  workingDirectory?: string;
}

export const GitDrawer: React.FC<GitDrawerProps> = ({ visible, onClose, workingDirectory }) => {
  const [loading, setLoading] = useState(false);
  const [statusInfo, setStatusInfo] = useState<GitStatusInfo | null>(null);

  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [currentDiff, setCurrentDiff] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<string>('');

  // Code review state
  const [reviewing, setReviewing] = useState(false);
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const [reviewAgentInfo, setReviewAgentInfo] = useState<string | null>(null);

  // Commit state
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);

  const fetchStatus = async () => {
    if (!workingDirectory) return;
    setLoading(true);
    try {
      const data = await gitApi.getStatus(workingDirectory);
      setStatusInfo(data);
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && workingDirectory) {
      fetchStatus();
    }
  }, [visible, workingDirectory]);

  const handleViewDiff = async (file: GitFileStatus) => {
    if (!workingDirectory) return;
    setCurrentFile(file.path);
    setDiffModalVisible(true);
    setLoadingDiff(true);
    setCurrentDiff('');
    try {
      const diff = await gitApi.getDiff(workingDirectory, file.path);
      setCurrentDiff(diff || '(No diff output or binary file)');
    } catch (error: any) {
      setCurrentDiff(`Error: ${error.message}`);
    } finally {
      setLoadingDiff(false);
    }
  };

  const handleCodeReview = async () => {
    if (!workingDirectory) return;
    if (!statusInfo?.files || statusInfo.files.length === 0) {
      message.warning('没有需要审查的变更');
      return;
    }

    setReviewing(true);
    try {
      const result = await gitApi.codeReview(workingDirectory);
      setReviewTaskId(result.taskId);
      setReviewAgentInfo(`${result.agentName} (${result.routingReason})`);
      message.success(`代码审查已启动! ${result.agentName} (${result.routingReason})`);
    } catch (error: any) {
      message.error(error.message || '代码审查启动失败');
    } finally {
      setReviewing(false);
    }
  };

  const handleCommitPush = async () => {
    if (!workingDirectory) return;
    if (!commitMessage.trim()) {
      message.warning('请输入提交信息');
      return;
    }

    setCommitting(true);
    try {
      const result = await gitApi.commitPush(workingDirectory, commitMessage.trim());
      message.success(result.message);
      setCommitMessage('');
      // Refresh status after commit
      await fetchStatus();
    } catch (error: any) {
      message.error(error.message || '提交推送失败');
    } finally {
      setCommitting(false);
    }
  };

  const renderStatusTag = (status: string) => {
    const s = status.trim();
    if (s === 'M') return <Tag color="blue">M</Tag>;
    if (s === 'A') return <Tag color="green">A</Tag>;
    if (s === 'D') return <Tag color="red">D</Tag>;
    if (s === '??') return <Tag color="default">U</Tag>;
    if (s.includes('M')) return <Tag color="blue">M</Tag>;
    return <Tag>{s}</Tag>;
  };

  const changeCount = statusInfo?.files?.length || 0;

  return (
    <>
      <Drawer
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Source Control</span>
            <Button type="text" icon={<ReloadOutlined />} onClick={fetchStatus} loading={loading} />
          </div>
        }
        placement="right"
        onClose={onClose}
        open={visible}
        width={360}
        styles={{ body: { padding: 0 } }}
        className="git-drawer"
      >
        {!workingDirectory ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#8B949E' }}>
            未选择工作目录
          </div>
        ) : (
          <div className="git-content">
            {/* Branch header */}
            <div className="git-header" style={{ padding: '12px 16px', borderBottom: '1px solid #30363D' }}>
              <Space>
                <BranchesOutlined style={{ color: '#8B949E' }} />
                <Text strong style={{ color: '#C9D1D9' }}>{statusInfo?.branch || 'Unknown Branch'}</Text>
                {changeCount > 0 && (
                  <Tag color="processing" style={{ fontSize: 11 }}>{changeCount} changes</Tag>
                )}
              </Space>
            </div>

            {/* Action buttons bar */}
            <div className="git-actions-bar" style={{ padding: '10px 16px', borderBottom: '1px solid #30363D', display: 'flex', gap: 8 }}>
              <Button
                type="primary"
                icon={<ScanOutlined />}
                onClick={handleCodeReview}
                loading={reviewing}
                disabled={!statusInfo?.files || statusInfo.files.length === 0}
                style={{ flex: 1, fontSize: 12 }}
                size="small"
                title="一键代码审查"
              >
                代码审查
              </Button>
              <Button
                type="default"
                icon={<CloudUploadOutlined />}
                onClick={handleCommitPush}
                loading={committing}
                disabled={!commitMessage.trim() || !statusInfo?.files || statusInfo.files.length === 0}
                style={{ flex: 1, fontSize: 12 }}
                size="small"
                title="提交并推送"
              >
                提交推送
              </Button>
            </div>

            {/* Commit message input */}
            <div className="git-commit-section" style={{ padding: '10px 16px', borderBottom: '1px solid #30363D' }}>
              <TextArea
                placeholder="输入提交信息..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                rows={2}
                maxLength={200}
                showCount
                style={{ fontSize: 12, resize: 'none' }}
                onPressEnter={(e) => {
                  if (e.ctrlKey) {
                    handleCommitPush();
                  }
                }}
              />
              <div style={{ marginTop: 4, fontSize: 11, color: '#8B949E' }}>
                Ctrl+Enter 快速提交
              </div>
            </div>

            {/* File list */}
            <Spin spinning={loading}>
              <List
                size="small"
                dataSource={statusInfo?.files || []}
                renderItem={(item) => (
                  <List.Item
                    className="git-list-item"
                    onClick={() => handleViewDiff(item)}
                    style={{ cursor: 'pointer', padding: '8px 16px', borderBottom: '1px solid #30363D' }}
                  >
                    <Space style={{ width: '100%' }}>
                      {renderStatusTag(item.status)}
                      <FileTextOutlined style={{ color: '#8B949E' }} />
                      <Text style={{ color: '#C9D1D9', wordBreak: 'break-all', fontSize: 13 }}>{item.path}</Text>
                    </Space>
                  </List.Item>
                )}
                locale={{ emptyText: 'No changes' }}
              />
            </Spin>

            {/* Review task info */}
            {reviewTaskId && (
              <Alert
                message="代码审查任务"
                description={
                  <div>
                    <div style={{ fontSize: 12 }}>任务ID: {reviewTaskId}</div>
                    {reviewAgentInfo && (
                      <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>
                        Agent: {reviewAgentInfo}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>
                      请在任务面板查看审查结果
                    </div>
                  </div>
                }
                type="info"
                showIcon
                closable
                onClose={() => { setReviewTaskId(null); setReviewAgentInfo(null); }}
                style={{ margin: '8px 16px', fontSize: 12 }}
              />
            )}
          </div>
        )}
      </Drawer>

      <DiffModal
        open={diffModalVisible}
        file={currentFile}
        diffText={currentDiff}
        loading={loadingDiff}
        onClose={() => setDiffModalVisible(false)}
      />
    </>
  );
};
