import request from './request';

export const authApi = {
  login: (data: any) => request.post('/auth/login', data) as Promise<any>,
  register: (data: any) => request.post('/auth/register', data) as Promise<any>,
  me: () => request.get('/auth/me') as Promise<any>,
};

export const skillsApi = {
  getSkills: () => request.get('/skills') as Promise<any>,
  createSkill: (data: { skillName: string; description: string }) => request.post('/skills', data) as Promise<any>,
  getSkillContent: (name: string) => request.get(`/skills/${name}/content`) as Promise<any>,
  updateSkillContent: (name: string, data: { description: string }) => request.put(`/skills/${name}/content`, data) as Promise<any>,
  deleteSkill: (name: string) => request.delete(`/skills/${name}`) as Promise<any>,
};

export const filesApi = {
  listFiles: (path?: string) => request.get('/files/list', { params: { path } }) as Promise<any>,
  getFileContent: (path: string) => request.get('/files/content', { params: { path } }) as Promise<any>,
  mkdir: (data: { parentPath: string; name: string }) => request.post('/files/mkdir', data) as Promise<any>,
  writeFile: (data: { relativePath: string; content: string }) => request.post('/files/write', data) as Promise<any>,
  deleteFile: (data: { relativePath: string }) => request.post('/files/delete', data) as Promise<any>,
  uploadFile: (formData: FormData) => request.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }) as Promise<any>,
};

export const agentsApi = {
  getAgents: () => request.get('/agents') as Promise<any>,
  getTemplates: () => request.get('/agents/templates') as Promise<any>,
  getModels: () => request.get('/agents/models') as Promise<any>,
  saveModels: (models: string[]) => request.post('/agents/models', { models }) as Promise<any>,
  createAgent: (data: any) => request.post('/agents', data) as Promise<any>,
  updateAgent: (id: string, data: any) => request.put(`/agents/${id}`, data) as Promise<any>,
  deleteAgent: (id: string) => request.delete(`/agents/${id}`) as Promise<any>,
  togglePinAgent: (id: string) => request.post(`/agents/${id}/toggle-pin`) as Promise<any>,
};

export const tasksApi = {
  getTasks: (params: { agentId?: string; status?: string; sessionId?: string; skip?: number; take?: number }) => 
    request.get('/tasks', { params }) as Promise<any>,
  getTaskDetail: (id: string) => request.get(`/tasks/${id}`) as Promise<any>,
  createTask: (data: any) => request.post('/tasks', data) as Promise<any>,
  cancelTask: (id: string) => request.post(`/tasks/${id}/cancel`) as Promise<any>,
  deleteTask: (id: string) => request.delete(`/tasks/${id}`) as Promise<any>,
  getTaskOutput: (id: string) => request.get(`/tasks/${id}/output`) as Promise<any>,
  deleteSession: (params: { sessionId?: string; taskId?: string }) => 
    request.delete('/tasks/session', { params }) as Promise<any>,
  updateSessionTitle: (sessionId: string, title: string) => request.put(`/tasks/session/${sessionId}/title`, { title }) as Promise<any>,
  updateSessionDir: (sessionId: string, workingDir: string) => request.put(`/tasks/session/${sessionId}/working-dir`, { workingDir }) as Promise<any>,
};

export const adminApi = {
  // 用户管理
  getUsers: () => request.get('/admin/users') as Promise<any>,
  createUser: (data: { username: string; password: string }) => request.post('/admin/users', data) as Promise<any>,
  updateUser: (id: string, data: { username?: string; password?: string }) => request.put(`/admin/users/${id}`, data) as Promise<any>,
  deleteUser: (id: string) => request.delete(`/admin/users/${id}`) as Promise<any>,
  // 模型计费
  getModelPricing: () => request.get('/admin/model-pricing') as Promise<any>,
  saveModelPricing: (items: { modelId: string; inputPricePerMillion: number; outputPricePerMillion: number; cacheInputPricePerMillion: number }[]) =>
    request.post('/admin/model-pricing', { items }) as Promise<any>,
};

