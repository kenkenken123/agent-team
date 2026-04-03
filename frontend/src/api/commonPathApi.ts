import api from './request';
import type { CommonPath, CreateCommonPathRequest } from '../types';

export const commonPathApi = {
  getAll: () => api.get<CommonPath[]>('/api/common-paths').then(r => r.data),
  create: (req: CreateCommonPathRequest) => api.post<CommonPath>('/api/common-paths', req).then(r => r.data),
  delete: (id: string) => api.delete(`/api/common-paths/${id}`),
};
