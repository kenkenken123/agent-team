import request from './request';

export interface SystemSetting {
  key: string;
  value: string;
  description?: string;
  updatedAt?: string;
}

export const getSettings = () => request.get<SystemSetting[]>('/api/settings');

export const updateSettings = (settings: SystemSetting[]) => request.put('/api/settings', settings);
