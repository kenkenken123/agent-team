export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentTemplateRequest {
  name: string;
  description: string;
  systemPrompt: string;
}

export interface UpdateAgentTemplateRequest extends CreateAgentTemplateRequest {
  isEnabled: boolean;
}

// Agent 类型
export interface Agent {
  id: string;
  name: string;
  templateId: string;
  template?: AgentTemplate;
  workingDirectory: string;
  model: string;
  maxTurns?: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentRequest {
  name: string;
  templateId: string;
  workingDirectory: string;
  model: string;
  maxTurns?: number;
}

export interface UpdateAgentRequest extends CreateAgentRequest {
  isEnabled: boolean;
}

// Task 类型
export type TaskStatus = 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';

export interface AgentTask {
  id: string;
  agentId: string;
  agentName: string;
  workingDirectory?: string;
  prompt: string;
  status: TaskStatus;
  claudeSessionId?: string;
  terminalType: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  createdAt: string;
}

export interface CreateTaskRequest {
  agentId: string;
  prompt: string;
  resumeSessionId?: string;
  forceNewSession?: boolean;
  terminalType?: string;
}

// Stats 类型
export interface OverviewStats {
  totalAgents: number;
  runningTasks: number;
  todayTasks: number;
  todayInputTokens: number;
  todayOutputTokens: number;
}

// WebSocket 消息类型
export interface WsOutputMessage {
  type: 'output';
  taskId: string;
  content: string;
}

export interface WsStatusMessage {
  type: 'status';
  taskId: string;
  status: TaskStatus;
}

export type WsMessage = WsOutputMessage | WsStatusMessage;
