import api from './request';
import type { OverviewStats } from '../types';

export const statsApi = {
  getOverview: async (): Promise<OverviewStats> => {
    const res = await api.get<OverviewStats>('/api/stats/overview');
    return res.data;
  },
  
  getTokens: async (days = 7, agentId?: string) => {
    const res = await api.get('/api/stats/tokens', {
      params: { days, agentId }
    });
    return res.data;
  },
  
  validateDirectory: async (path: string) => {
    const res = await api.post('/api/stats/validate-directory', { path });
    return res.data;
  }
};
