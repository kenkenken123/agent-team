import request from './request';

export interface ShortTermMemory {
  role: string;
  content: string;
  timestamp: string;
}

export interface LongTermMemory {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const memoryApi = {
  getShortTermMemories: () => request.get<ShortTermMemory[]>('/api/memories/short-term').then(r => r.data),
  getLongTermMemories: () => request.get<LongTermMemory[]>('/api/memories/long-term').then(r => r.data),
  updateLongTermMemory: (id: string, content: string) => request.put<LongTermMemory>(`/api/memories/long-term/${id}`, { content }).then(r => r.data),
  deleteLongTermMemory: (id: string) => request.delete(`/api/memories/long-term/${id}`).then(r => r.data),
  getUserProfile: () => request.get<any>('/api/memories/profile').then(r => r.data),
  updateUserProfile: (profileJson: string) => request.put('/api/memories/profile', { profileJson }).then(r => r.data),
};
