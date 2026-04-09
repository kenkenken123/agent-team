import React, { useState } from 'react';
import { Button, Space, Typography, Input } from 'antd';
import {
  QuestionCircleFilled,
  SendOutlined,
  PlayCircleOutlined
} from '@ant-design/icons';
import type { WsAskUserQuestionMessage } from '../../types';

const { Text } = Typography;
const { TextArea } = Input;

interface UserQuestionDialogProps {
  request: WsAskUserQuestionMessage;
  onAnswer: (requestId: string, answer: string) => void;
}

const UserQuestionDialog: React.FC<UserQuestionDialogProps> = ({
  request,
  onAnswer,
}) => {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!answer.trim()) return;
    setSubmitted(true);
    onAnswer(request.requestId, answer.trim());
  };

  return (
    <div style={{
      background: 'rgba(56, 139, 253, 0.1)',
      border: '1px solid #1f3a5f',
      borderLeft: '3px solid #388bfd',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 12,
      boxShadow: '0 0 20px rgba(0,0,0,0.4)',
      animation: 'permissionSlideIn 0.3s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <Space size={8} align="center">
          <QuestionCircleFilled style={{ color: '#388bfd', fontSize: 16 }} />
          <Text strong style={{ color: '#C9D1D9', fontSize: 14 }}>
            💬 Claude 正在提问
          </Text>
        </Space>
      </div>

      <div style={{ 
        color: '#E6EDF3', 
        fontSize: 14, 
        marginBottom: 16,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap'
      }}>
        {request.question}
      </div>

      {!submitted ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextArea
            placeholder="请输入您的回答..."
            autoSize={{ minRows: 2, maxRows: 6 }}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            style={{ 
              background: '#0D1117', 
              color: '#C9D1D9', 
              borderColor: '#30363D' 
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.ctrlKey) {
                handleSubmit();
              }
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>按 Ctrl+Enter 快速发送</Text>
            <Button
              size="small"
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSubmit}
              disabled={!answer.trim()}
              style={{ background: '#238636', borderColor: '#2EA043' }}
            >
              提交回答
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'right' }}>
          <Space>
            <PlayCircleOutlined style={{ color: '#3FB950' }} />
            <Text style={{ color: '#8B949E', fontSize: 12 }}>
              回答已提交，等待 Claude 继续处理...
            </Text>
          </Space>
        </div>
      )}
    </div>
  );
};

export default UserQuestionDialog;
