import React from 'react';
import { Tag, type TagProps } from 'antd';
import type { TaskStatus } from '../types/index';


const STATUS_MAP: Record<TaskStatus, { color: TagProps['color']; text: string }> = {
  Pending: { color: 'default', text: '等待中' },
  Running: { color: 'processing', text: '运行中' },
  Completed: { color: 'success', text: '已完成' },
  Failed: { color: 'error', text: '失败' },
  Cancelled: { color: 'warning', text: '已取消' },
};

interface TaskStatusTagProps {
  status: TaskStatus;
}

const TaskStatusTag: React.FC<TaskStatusTagProps> = ({ status }) => {
  const { color, text } = STATUS_MAP[status] ?? { color: 'default', text: status };
  return <Tag color={color}>{text}</Tag>;
};

export default TaskStatusTag;
