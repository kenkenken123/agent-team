import api from './request';
import type { AgentTask, CreateTaskRequest, OverviewStats } from '../types';

export const taskApi = {
  getAll: (params?: { agentId?: string; status?: string; sessionId?: string; skip?: number; take?: number }) =>
    api.get<{ items: AgentTask[], total: number }>('/api/tasks', { params }).then(r => r.data),
  getById: (id: string) => api.get<AgentTask>(`/api/tasks/${id}`).then(r => r.data),
  create: (req: CreateTaskRequest) => api.post<AgentTask>('/api/tasks', req).then(r => r.data),
  cancel: (id: string) => api.post(`/api/tasks/${id}/cancel`),
  delete: (id: string) => api.delete(`/api/tasks/${id}`),
  deleteSession: (sessionId?: string, taskId?: string) => 
    api.delete('/api/tasks/session', { params: { sessionId, taskId } }),
  getOutput: (id: string) =>

    api.get<{ content: string }>(`/api/tasks/${id}/output`).then(r => r.data.content),
};

export const statsApi = {
  overview: () => api.get<OverviewStats>('/api/stats/overview').then(r => r.data),
  validateDirectory: (path: string) =>
    api.post<{ exists: boolean }>('/api/stats/validate-directory', { path }).then(r => r.data),
};
