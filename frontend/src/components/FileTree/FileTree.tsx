import React, { useState, useEffect } from 'react';
import { Tree, Spin, message } from 'antd';
import { FileTextOutlined, FolderOutlined, FolderOpenOutlined } from '@ant-design/icons';
import type { DataNode, TreeProps } from 'antd/es/tree';
import { fileApi } from '../../api/fileApi';
import type { FileEntry } from '../../api/fileApi';

interface FileTreeProps {
  rootPath: string;
  onFileClick?: (filePath: string) => void;
  onDragStart?: (filePath: string, fileType: 'file' | 'directory') => void;
}

interface TreeNode extends DataNode {
  path: string;
  isLeaf: boolean;
  fileType: 'file' | 'directory';
}

const FileTree: React.FC<FileTreeProps> = ({ rootPath, onFileClick, onDragStart }) => {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  // 初始化加载根目录
  useEffect(() => {
    if (rootPath) {
      loadDirectory(rootPath, 0);
    }
  }, [rootPath]);

  // 加载目录内容
  const loadDirectory = async (dirPath: string, parentLevel: number) => {
    try {
      setLoading(true);
      const entries = await fileApi.list(dirPath);

      // 转换为树节点格式
      const nodes: TreeNode[] = entries.map(entry => ({
        title: entry.name,
        key: entry.path,
        path: entry.path,
        isLeaf: entry.type === 'file',
        fileType: entry.type,
        icon: entry.type === 'file' ? <FileTextOutlined /> : <FolderOutlined />,
        children: entry.type === 'directory' ? [] : undefined,
        draggable: true
      }));

      if (parentLevel === 0) {
        // 根目录直接设置
        setTreeData(nodes);
      } else {
        // 更新父节点的子节点
        setTreeData(prev => updateTreeChildren(prev, dirPath, nodes));
      }
    } catch (error: any) {
      message.error(error.message || '加载目录失败');
    } finally {
      setLoading(false);
    }
  };

  // 递归更新树节点的子节点
  const updateTreeChildren = (data: TreeNode[], parentPath: string, children: TreeNode[]): TreeNode[] => {
    return data.map(node => {
      if (node.path === parentPath) {
        return {
          ...node,
          children,
          icon: <FolderOpenOutlined />
        };
      }
      if (node.children) {
        return {
          ...node,
          children: updateTreeChildren(node.children as TreeNode[], parentPath, children)
        };
      }
      return node;
    });
  };

  // 加载子目录
  const loadData: TreeProps['loadData'] = async (node) => {
    const treeNode = node as TreeNode;
    if (treeNode.isLeaf || (treeNode.children && treeNode.children.length > 0)) {
      return;
    }
    await loadDirectory(treeNode.path, 1);
  };

  // 节点双击事件：文件和目录都支持
  const onNodeDoubleClick: TreeProps['onDoubleClick'] = (_, node) => {
    const treeNode = node as TreeNode;
    onFileClick?.(treeNode.path);
  };

  // 拖拽开始事件
  const onNodeDragStart: TreeProps['onDragStart'] = (event) => {
    const treeNode = event.node as TreeNode;
    if (onDragStart) {
      onDragStart(treeNode.path, treeNode.fileType);
    }
    // 设置拖拽数据
    event.nativeEvent.dataTransfer.setData('text/plain', treeNode.path);
    event.nativeEvent.dataTransfer.setData('application/x-file-path', treeNode.path);
    event.nativeEvent.dataTransfer.effectAllowed = 'copy';
  };

  // 展开/折叠事件，切换图标
  const onExpand: TreeProps['onExpand'] = (expandedKeys, { expanded, node }) => {
    const treeNode = node as TreeNode;
    if (!treeNode.isLeaf) {
      setTreeData(prev => updateNodeIcon(prev, treeNode.path, expanded));
    }
  };

  // 更新节点图标
  const updateNodeIcon = (data: TreeNode[], path: string, expanded: boolean): TreeNode[] => {
    return data.map(node => {
      if (node.path === path) {
        return {
          ...node,
          icon: expanded ? <FolderOpenOutlined /> : <FolderOutlined />
        };
      }
      if (node.children) {
        return {
          ...node,
          children: updateNodeIcon(node.children as TreeNode[], path, expanded)
        };
      }
      return node;
    });
  };

  if (!rootPath) {
    return <div className="p-4 text-center text-gray-500" role="status">请先选择工作目录</div>;
  }

  return (
    <div className="file-tree" style={{ padding: '16px 0' }} role="region" aria-label="目录结构">
      <Spin spinning={loading}>
        <Tree
          showIcon
          draggable
          loadData={loadData}
          treeData={treeData}
          onDoubleClick={onNodeDoubleClick}
          onExpand={onExpand}
          onDragStart={onNodeDragStart}
          defaultExpandParent
          style={{ background: 'transparent', border: 'none' }}
        />
      </Spin>
    </div>
  );
};

export default FileTree;
