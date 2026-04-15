import React from 'react';
import { Drawer } from 'antd';
import FileTree from '../FileTree/FileTree';

interface FileTreeDrawerProps {
  visible: boolean;
  onClose: () => void;
  workingDirectory?: string;
  onFileClick?: (filePath: string) => void;
  onDragStart?: (filePath: string, fileType: 'file' | 'directory') => void;
}

const FileTreeDrawer: React.FC<FileTreeDrawerProps> = ({ visible, onClose, workingDirectory, onFileClick, onDragStart }) => {
  return (
    <Drawer
      title="目录结构 (可拖拽文件/目录到输入框)"
      placement="right"
      size="default"
      open={visible}
      onClose={onClose}
      mask={false}
      styles={{ body: { padding: '16px 24px' } }}
    >
      <FileTree
        rootPath={workingDirectory || ''}
        onFileClick={onFileClick}
        onDragStart={onDragStart}
      />
    </Drawer>
  );
};

export default FileTreeDrawer;
