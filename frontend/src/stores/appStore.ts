import { create } from 'zustand';

export type PageKey = 'dashboard' | 'agents' | 'console' | 'history' | 'simulation' | 'settings' | 'butler';

interface AppState {
  currentPage: PageKey;
  selectedAgentId: string | null;
  initialConsoleTab: 'output' | 'terminal' | null;
  
  // Actions
  setPage: (page: PageKey) => void;
  setSelectedAgentId: (id: string | null) => void;
  setInitialConsoleTab: (tab: 'output' | 'terminal' | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'butler',
  selectedAgentId: null,
  initialConsoleTab: null,

  setPage: (page) => set({ currentPage: page }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setInitialConsoleTab: (tab) => set({ initialConsoleTab: tab }),
}));
