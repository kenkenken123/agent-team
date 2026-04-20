export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Agent Group 类型
export interface AgentGroup {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder: number;
  agentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentGroupRequest {
  name: string;
  description?: string;
  color?: string;
  sortOrder?: number;
}

export interface UpdateAgentGroupRequest {
  name: string;
  description?: string;
  color?: string;
  sortOrder: number;
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
  workingDirectory?: string;
  allowedModels: string;
  maxTurns?: number;
  isEnabled: boolean;
  isPinned: boolean;
  lastUsedAt?: string;
  status: string;
  latestTaskPrompt?: string;
  latestTaskId?: string;
  groupId?: string;
  group?: AgentGroup;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentRequest {
  name: string;
  templateId: string;
  workingDirectory?: string;
  allowedModels: string;
  maxTurns?: number;
  groupId?: string;
}

export interface UpdateAgentRequest extends CreateAgentRequest {
  isEnabled: boolean;
}

// Common Path 类型
export interface CommonPath {
  id: string;
  path: string;
  name: string;
  createdAt: string;
}

export interface CreateCommonPathRequest {
  path: string;
  name: string;
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
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  model?: string;
  isPlanMode?: boolean;
  finalResult?: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  butlerSummary?: string;
  optimizedPrompt?: string;
  imageUrls?: string;
  createdAt: string;
}

export interface CreateTaskRequest {
  agentId?: string;
  prompt: string;
  model?: string;
  workingDirectory?: string;
  resumeSessionId?: string;
  forceNewSession?: boolean;
  terminalType?: string;
  autoIdentifyAgent?: boolean;
  optimizePrompt?: boolean;
  planMode?: boolean;
}

// Stats 类型
export interface AgentUsage {
  agentId: string;
  agentName: string;
  taskCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
}

export interface OverviewStats {
  totalAgents: number;
  runningTasks: number;
  periodTasks: number;
  periodInputTokens: number;
  periodOutputTokens: number;
  periodCacheReadTokens: number;
  periodCacheCreationTokens: number;
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

export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface WsPermissionRequestMessage {
  type: 'permission_request';
  taskId: string;
  requestId: string;
  toolName: string;
  inputDisplay: string;  // 格式化后的操作摘要
  rawInput: string;      // 完整的原始 JSON 输入
  riskLevel: RiskLevel;
  createdAt: string;
}

export interface WsPermissionResolvedMessage {
  type: 'permission_resolved';
  taskId: string;
  requestId: string;
  decision: 'allow' | 'deny';
}

export interface WsAskUserQuestionMessage {
  type: 'ask_user_question';
  taskId: string;
  requestId: string;
  question: string;
}

export interface WsSummaryReadyMessage {
  type: 'summary_ready';
  taskId: string;
  summary: string;
}

export type WsMessage =
  | WsOutputMessage
  | WsStatusMessage
  | WsPermissionRequestMessage
  | WsPermissionResolvedMessage
  | WsAskUserQuestionMessage
  | WsSummaryReadyMessage;

