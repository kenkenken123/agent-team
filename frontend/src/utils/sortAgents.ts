import type { Agent } from '../types';

/**
 * Agent 排序逻辑: 置顶优先 > lastUsedAt 降序 > createdAt 降序
 * 与 Console 页面的 Agent 列表排序保持一致
 */
export function sortAgents(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
