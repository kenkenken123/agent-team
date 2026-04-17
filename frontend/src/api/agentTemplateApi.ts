import api from './request';
import type { AgentTemplate, CreateAgentTemplateRequest, UpdateAgentTemplateRequest } from '../types';

export const agentTemplateApi = {
  getAll: () => api.get<AgentTemplate[]>('/api/agent-templates').then(r => r.data),
  getById: (id: string) => api.get<AgentTemplate>(`/api/agent-templates/${id}`).then(r => r.data),
  create: (req: CreateAgentTemplateRequest) => api.post<AgentTemplate>('/api/agent-templates', req).then(r => r.data),
  update: (id: string, req: UpdateAgentTemplateRequest) => api.put<AgentTemplate>(`/api/agent-templates/${id}`, req).then(r => r.data),
  delete: (id: string) => api.delete(`/api/agent-templates/${id}`),
  optimizePrompt: (prompt: string) => api.post<{ systemPrompt: string }>('/api/agent-templates/optimize-prompt', { systemPrompt: prompt }).then(r => r.data.systemPrompt),
};
