import { useState, useEffect } from 'react';
import { Card, Button, Input, Modal, Space, Typography, message, Row, Col, Popconfirm } from 'antd';
import Editor from '@monaco-editor/react';
import {
  FolderOutlined,
  FileOutlined,
  PlusOutlined,
  SaveOutlined,
  DeleteOutlined,
  FolderAddOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { filesApi } from '../../api/saasApi';

const { Title } = Typography;

interface FileNode {
  name: string;
  type: string;
  size: number | null;
  lastModified: string;
  relativePath: string;
}

export default function Files() {
  const getLanguage = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'py':
        return 'python';
      case 'cs':
        return 'csharp';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'sh':
      case 'bat':
      case 'ps1':
        return 'shell';
      default:
        return 'plaintext';
    }
  };

  const [fileList, setFileList] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [mkdirVisible, setMkdirVisible] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  const [createFileVisible, setCreateFileVisible] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const loadFiles = async (path: string = '') => {
    setLoading(true);
    try {
      const data = await filesApi.listFiles(path);
      setFileList(data);
      setCurrentPath(path);
      setPathInput(path);
    } catch (err: any) {
      message.error(err.message || '加载文件列表失败');
      setPathInput(currentPath);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleFolderClick = (path: string) => {
    loadFiles(path);
  };

  const handleFileClick = async (file: FileNode) => {
    try {
      const res = await filesApi.getFileContent(file.relativePath);
      setActiveFile(file);
      setFileContent(res.content || '');
    } catch (err: any) {
      message.error(err.message || '获取文件内容失败');
    }
  };

  const handleSaveFile = async () => {
    if (!activeFile) return;
    setIsSaving(true);
    try {
      await filesApi.writeFile({
        relativePath: activeFile.relativePath,
        content: fileContent,
      });
      message.success('文件保存成功');
    } catch (err: any) {
      message.error(err.message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newDirName.trim()) {
      message.warning('请输入目录名称');
      return;
    }
    try {
      await filesApi.mkdir({
        parentPath: currentPath,
        name: newDirName.trim(),
      });
      message.success('创建文件夹成功');
      setMkdirVisible(false);
      setNewDirName('');
      loadFiles(currentPath);
    } catch (err: any) {
      message.error(err.message || '创建失败');
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) {
      message.warning('请输入文件名称');
      return;
    }
    const relativeFilePath = currentPath ? `${currentPath}/${newFileName.trim()}` : newFileName.trim();
    try {
      await filesApi.writeFile({
        relativePath: relativeFilePath,
        content: '',
      });
      message.success('创建文件成功');
      setCreateFileVisible(false);
      setNewFileName('');
      loadFiles(currentPath);
    } catch (err: any) {
      message.error(err.message || '创建失败');
    }
  };

  const handleDelete = async (file: FileNode) => {
    try {
      await filesApi.deleteFile({
        relativePath: file.relativePath,
      });
      message.success('删除成功');
      if (activeFile?.relativePath === file.relativePath) {
        setActiveFile(null);
        setFileContent('');
      }
      loadFiles(currentPath);
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const goBack = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    loadFiles(parentPath);
  };

  return (
    <div style={{ padding: '8px', height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 700 }} className="gradient-text">
            专属文件区
          </Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 0 0' }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>当前目录:</span>
            <Input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onPressEnter={() => loadFiles(pathInput.trim())}
              placeholder="输入相对路径，回车切换 (根目录为空)"
              size="small"
              prefix={<span style={{ color: 'rgba(255,255,255,0.25)', marginRight: 2 }}>/</span>}
              style={{
                width: 320,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
                borderRadius: 6,
              }}
            />
            <Button
              type="primary"
              size="small"
              onClick={() => loadFiles(pathInput.trim())}
              className="glow-btn"
              style={{ fontSize: 12, height: 24 }}
            >
              前往
            </Button>
          </div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => loadFiles(currentPath)}>
            刷新
          </Button>
          {currentPath && <Button onClick={goBack}>返回上级</Button>}
          <Button type="primary" icon={<FolderAddOutlined />} onClick={() => setMkdirVisible(true)} className="glow-btn">
            新建文件夹
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateFileVisible(true)} className="glow-btn">
            新建文件
          </Button>
        </Space>
      </div>

      <Row gutter={24} style={{ flex: 1, minHeight: 0 }}>
        <Col span={10} style={{ height: '100%', overflowY: 'auto' }}>
          <Card bordered={false} className="glass-card" style={{ height: '100%', overflowY: 'auto' }} bodyStyle={{ padding: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {fileList.map((item) => (
                <div
                  key={item.relativePath}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: activeFile?.relativePath === item.relativePath ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                    border: activeFile?.relativePath === item.relativePath ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.25s',
                  }}
                  onClick={() => (item.type === 'directory' ? handleFolderClick(item.relativePath) : handleFileClick(item))}
                  className="file-row"
                >
                  <Space>
                    {item.type === 'directory' ? (
                      <FolderOutlined style={{ fontSize: 16, color: '#d4af37' }} />
                    ) : (
                      <FileOutlined style={{ fontSize: 16, color: '#8ba4f9' }} />
                    )}
                    <span style={{ color: item.type === 'directory' ? '#d4af37' : '#d9d9d9', fontWeight: item.type === 'directory' ? 600 : 400 }}>
                      {item.name}
                    </span>
                  </Space>
                  <Space>
                    {item.size !== null && (
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
                        {(item.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                    <Popconfirm
                      title="确定删除此文件/目录吗？"
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        handleDelete(item);
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                      okText="确认"
                      cancelText="取消"
                    >
                      <DeleteOutlined
                        style={{ color: '#ff4d4f', padding: 4 }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  </Space>
                </div>
              ))}
              {fileList.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.25)' }}>
                  空目录
                </div>
              )}
            </div>
          </Card>
        </Col>

        <Col span={14} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Card
            bordered={false}
            className="glass-card"
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12 }}
            title={activeFile ? `编辑: ${activeFile.name}` : '在线代码编辑器'}
            extra={
              activeFile && (
                <Button type="primary" icon={<SaveOutlined />} loading={isSaving} onClick={handleSaveFile} className="glow-btn">
                  保存文件
                </Button>
              )
            }
          >
            {activeFile ? (
              <div style={{ flex: 1, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
                <Editor
                  height="100%"
                  language={getLanguage(activeFile.name)}
                  theme="vs-dark"
                  value={fileContent}
                  onChange={(val) => setFileContent(val || '')}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: 'Fira Code, Source Code Pro, monospace',
                    automaticLayout: true,
                  }}
                />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'rgba(255,255,255,0.25)' }}>
                请在左侧点击或双击文件载入进行在线编辑
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Modal title="新建文件夹" open={mkdirVisible} onCancel={() => setMkdirVisible(false)} onOk={handleCreateFolder} okText="创建" cancelText="取消" okButtonProps={{ className: 'glow-btn' }}>
        <div style={{ marginTop: 16 }}>
          <Input placeholder="输入文件夹名称" value={newDirName} onChange={(e) => setNewDirName(e.target.value)} />
        </div>
      </Modal>

      <Modal title="新建空文件" open={createFileVisible} onCancel={() => setCreateFileVisible(false)} onOk={handleCreateFile} okText="创建" cancelText="取消" okButtonProps={{ className: 'glow-btn' }}>
        <div style={{ marginTop: 16 }}>
          <Input placeholder="例如: index.js" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
