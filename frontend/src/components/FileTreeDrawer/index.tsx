import React from 'react';
import { Drawer } from 'antd';
import FileTree from '../FileTree/FileTree';

interface FileTreeDrawerProps {
  visible: boolean;
  onClose: () => void;
  workingDirectory?: string;
  onFileClick?: (filePath: string) => void;
  onDragStart?: (filePath: string) => void;
}

const FileTreeDrawer: React.FC<FileTreeDrawerProps> = ({ visible, onClose, workingDirectory, onFileClick, onDragStart }) => {
  return (
    <Drawer
      title="目录结构 (双击文件/目录以 @相对路径 格式添加到输入框)"
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
