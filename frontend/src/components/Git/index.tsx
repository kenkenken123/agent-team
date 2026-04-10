import React, { useState, useEffect } from 'react';
import { Drawer, List, Typography, Space, Button, Modal, Spin, Tag } from 'antd';
import { ReloadOutlined, FileTextOutlined, BranchesOutlined } from '@ant-design/icons';
import { gitApi } from '../../api/gitApi';
import type { GitStatusInfo, GitFileStatus } from '../../api/gitApi';
import './index.css';

const { Text } = Typography;

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

  const renderStatusTag = (status: string) => {
    const s = status.trim();
    if (s === 'M') return <Tag color="blue">M</Tag>;
    if (s === 'A') return <Tag color="green">A</Tag>;
    if (s === 'D') return <Tag color="red">D</Tag>;
    if (s === '??') return <Tag color="default">U</Tag>;
    if (s.includes('M')) return <Tag color="blue">M</Tag>;
    return <Tag>{s}</Tag>;
  };

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
        width={320}
        styles={{ body: { padding: 0 } }}
        className="git-drawer"
      >
        {!workingDirectory ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#8B949E' }}>
            未选择工作目录
          </div>
        ) : (
          <div className="git-content">
            <div className="git-header" style={{ padding: '12px 16px', borderBottom: '1px solid #30363D' }}>
              <Space>
                <BranchesOutlined style={{ color: '#8B949E' }} />
                <Text strong style={{ color: '#C9D1D9' }}>{statusInfo?.branch || 'Unknown Branch'}</Text>
              </Space>
            </div>
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
          </div>
        )}
      </Drawer>

      <Modal
        title={`Diff: ${currentFile}`}
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        footer={null}
        width={800}
        styles={{ body: { padding: 0, backgroundColor: '#0D1117' } }}
      >
        <Spin spinning={loadingDiff}>
          <div className="diff-viewer-container" style={{ padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
            <pre style={{ margin: 0, color: '#C9D1D9', fontSize: 13, fontFamily: 'Consolas, monospace' }}>
              {currentDiff.split('\n').map((line, i) => {
                let color = '#C9D1D9';
                let bg = 'transparent';
                if (line.startsWith('+')) { color = '#3FB950'; bg = 'rgba(63, 185, 80, 0.1)'; }
                else if (line.startsWith('-')) { color = '#F85149'; bg = 'rgba(248, 81, 73, 0.1)'; }
                else if (line.startsWith('@@')) { color = '#58A6FF'; bg = 'rgba(88, 166, 255, 0.1)'; }
                return <div key={i} style={{ color, backgroundColor: bg, padding: '0 4px' }}>{line}</div>;
              })}
            </pre>
          </div>
        </Spin>
      </Modal>
    </>
  );
};
