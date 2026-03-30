import api from './request';
import type { Agent, CreateAgentRequest, UpdateAgentRequest } from '../types';

export const agentApi = {
  getAll: () => api.get<Agent[]>('/api/agents').then(r => r.data),
  getById: (id: string) => api.get<Agent>(`/api/agents/${id}`).then(r => r.data),
  create: (req: CreateAgentRequest) => api.post<Agent>('/api/agents', req).then(r => r.data),
  update: (id: string, req: UpdateAgentRequest) =>
    api.put<Agent>(`/api/agents/${id}`, req).then(r => r.data),
  delete: (id: string) => api.delete(`/api/agents/${id}`),
};
