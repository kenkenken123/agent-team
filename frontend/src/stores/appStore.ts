import { create } from 'zustand';

export type PageKey = 'dashboard' | 'agents' | 'console' | 'history' | 'simulation' | 'settings' | 'butler' | 'config' | 'kanban' | 'system' | 'initialSetup';

interface AppState {
  currentPage: PageKey;
  selectedAgentId: string | null;
  selectedSessionId: string | null;
  initialConsoleTab: 'output' | 'terminal' | null;

  // 跨页面同步：当某页面修改了任务数据（删除/新建），其他页面可监听此值触发刷新
  dataSyncVersion: number;

  // Actions
  setPage: (page: PageKey) => void;
  setSelectedAgentId: (id: string | null) => void;
  setSelectedSessionId: (id: string | null) => void;
  setInitialConsoleTab: (tab: 'output' | 'terminal' | null) => void;
  bumpDataSync: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'butler',
  selectedAgentId: null,
  selectedSessionId: null,
  initialConsoleTab: null,
  dataSyncVersion: 0,

  setPage: (page) => set({ currentPage: page }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setSelectedSessionId: (id) => set({ selectedSessionId: id }),
  setInitialConsoleTab: (tab) => set({ initialConsoleTab: tab }),
  bumpDataSync: () => set((state) => ({ dataSyncVersion: state.dataSyncVersion + 1 })),
}));
