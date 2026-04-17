import { create } from 'zustand';

export type PageKey = 'dashboard' | 'agents' | 'console' | 'history' | 'simulation' | 'settings' | 'butler' | 'butlerMemory' | 'config' | 'kanban' | 'system' | 'initialSetup' | 'wechat';

export interface QueuedMessage {
  prompt: string;
  agentId: string;
  sessionId: string;
  model?: string;
  workingDirectory?: string;
  planMode?: boolean;
}

interface AppState {
  currentPage: PageKey;
  selectedAgentId: string | null;
  selectedSessionId: string | null;
  initialConsoleTab: 'output' | 'terminal' | null;
  selectedGroupId: string | null;

  // 跨页面同步：当某页面修改了任务数据（删除/新建），其他页面可监听此值触发刷新
  dataSyncVersion: number;

  // 全局排队消息（跨页面持久，切页不丢失）
  queuedMessage: QueuedMessage | null;

  // Actions
  setPage: (page: PageKey) => void;
  setSelectedAgentId: (id: string | null) => void;
  setSelectedSessionId: (id: string | null) => void;
  setInitialConsoleTab: (tab: 'output' | 'terminal' | null) => void;
  setSelectedGroupId: (id: string | null) => void;
  bumpDataSync: () => void;
  setQueuedMessage: (msg: QueuedMessage | null) => void;
}

// 获取初始 Hash 对应的页面，如果无效则默认 'butler'
const getInitialPage = (): PageKey => {
  const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
  const validPages: PageKey[] = ['dashboard', 'agents', 'console', 'history', 'simulation', 'settings', 'butler', 'butlerMemory', 'config', 'kanban', 'system', 'initialSetup', 'wechat'];
  return (hash && validPages.includes(hash as PageKey)) ? (hash as PageKey) : 'butler';
};

// 从 localStorage 读取上次使用的工作组 ID
const getInitialGroupId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('selectedAgentGroupId') || null;
};

export const useAppStore = create<AppState>((set) => ({
  currentPage: getInitialPage(),
  selectedAgentId: null,
  selectedSessionId: null,
  initialConsoleTab: null,
  selectedGroupId: getInitialGroupId(),
  dataSyncVersion: 0,
  queuedMessage: null,

  setPage: (page) => set({ currentPage: page }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setSelectedSessionId: (id) => set({ selectedSessionId: id }),
  setInitialConsoleTab: (tab) => set({ initialConsoleTab: tab }),
  setSelectedGroupId: (id) => {
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('selectedAgentGroupId', id);
      } else {
        localStorage.removeItem('selectedAgentGroupId');
      }
    }
    set({ selectedGroupId: id });
  },
  bumpDataSync: () => set((state) => ({ dataSyncVersion: state.dataSyncVersion + 1 })),
  setQueuedMessage: (msg) => set({ queuedMessage: msg }),
}));
