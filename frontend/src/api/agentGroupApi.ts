import api from './request';
import type { AgentGroup, CreateAgentGroupRequest, UpdateAgentGroupRequest } from '../types';

export const agentGroupApi = {
  getAll: () => api.get<AgentGroup[]>('/api/agent-groups').then(r => r.data),
  getById: (id: string) => api.get<AgentGroup>(`/api/agent-groups/${id}`).then(r => r.data),
  create: (req: CreateAgentGroupRequest) => api.post<AgentGroup>('/api/agent-groups', req).then(r => r.data),
  update: (id: string, req: UpdateAgentGroupRequest) =>
    api.put<AgentGroup>(`/api/agent-groups/${id}`, req).then(r => r.data),
  delete: (id: string) => api.delete(`/api/agent-groups/${id}`),
};
