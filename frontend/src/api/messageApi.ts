import request from './request';

export interface IncomingMessage {
  id: string;
  source: string;
  parsedText: string;
  status: string;
  routerReason?: string;
  triggeredAgentId?: string;
  triggeredAgentName?: string;
  triggeredTaskId?: string;
  imageUrls?: string;
  createdAt: string;
}

export interface PagedIncomingMessages {
  items: IncomingMessage[];
  total: number;
}

export const ingestMessage = (text: string, agentId?: string, imageUrls?: string[], optimizePrompt: boolean = false) => 
  request.post<IncomingMessage>('/api/messages/ingest', { text, agentId, imageUrls, optimizePrompt });

export const getMessages = (skip: number = 0, take: number = 10) => 
  request.get<PagedIncomingMessages>(`/api/messages?skip=${skip}&take=${take}`);
