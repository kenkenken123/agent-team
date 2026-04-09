import request from './request';

export interface CredentialTemplate {
    id: string;
    name: string;
    apiKey: string;
    baseUrl?: string;
    isDefault: boolean;
}

export interface ModelConfig {
    id?: string;
    modelId: string;
    templateId: string;
    template?: CredentialTemplate;
}

export const getTemplates = () => request.get<CredentialTemplate[]>('/api/config/templates');
export const createTemplate = (data: Partial<CredentialTemplate>) => request.post<CredentialTemplate>('/api/config/templates', data);
export const updateTemplate = (id: string, data: Partial<CredentialTemplate>) => request.put<CredentialTemplate>(`/api/config/templates/${id}`, data);
export const deleteTemplate = (id: string) => request.delete(`/api/config/templates/${id}`);

export const getModelConfigs = () => request.get<ModelConfig[]>('/api/config/models');
export const updateModelConfig = (data: ModelConfig) => request.post<ModelConfig>('/api/config/models', data);
export const deleteModelConfig = (id: string) => request.delete(`/api/config/models/${id}`);
