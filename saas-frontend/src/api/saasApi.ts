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
};

export const agentsApi = {
  getAgents: () => request.get('/agents') as Promise<any>,
  getTemplates: () => request.get('/agents/templates') as Promise<any>,
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
};
