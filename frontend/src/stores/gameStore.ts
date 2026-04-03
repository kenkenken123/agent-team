import { create } from 'zustand';

export type TileType = 0 | 1 | 2 | 3; // 0=地板, 1=墙, 2=工位, 3=休息区
export type AgentStatus = 'idle' | 'walking' | 'working' | 'resting';

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  color: number;
  gridX: number;
  gridY: number;
  targetX: number;
  targetY: number;
  pixelX: number;
  pixelY: number;
  workingDirectory?: string;
  latestTaskPrompt?: string; 
  latestTaskId?: string;
}

interface GameState {
  companyMap: TileType[][];
  agents: Agent[];
  workstations: { x: number; y: number }[];
  restSpots: { x: number; y: number }[];

  // Actions
  moveAgent: (agentId: string, targetX: number, targetY: number) => void;
  updateAgentPixelPosition: (agentId: string, x: number, y: number) => void;
  arriveAtTarget: (agentId: string) => void;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  refreshAgents: () => Promise<void>;
}

const TILE_SIZE = 48;

// 16x12 地图
const INITIAL_MAP: TileType[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const INITIAL_AGENTS: Agent[] = [
  {
    id: 'agent-1',
    name: 'Claude 3.5 Sonnet',
    status: 'idle',
    color: 0x58A6FF,
    gridX: 2,
    gridY: 4,
    targetX: 2,
    targetY: 4,
    pixelX: 2 * TILE_SIZE,
    pixelY: 4 * TILE_SIZE,
  },
  {
    id: 'agent-2',
    name: 'Gemini 1.5 Pro',
    status: 'idle',
    color: 0xBC8CFF,
    gridX: 13,
    gridY: 8,
    targetX: 13,
    targetY: 8,
    pixelX: 13 * TILE_SIZE,
    pixelY: 8 * TILE_SIZE,
  }
];

export const useGameStore = create<GameState>((set) => ({
  companyMap: INITIAL_MAP,
  agents: [],
  workstations: [],
  restSpots: [],

  moveAgent: (agentId, targetX, targetY) => set((state) => ({
    agents: state.agents.map((a) =>
      a.id === agentId ? { ...a, targetX, targetY, status: 'walking' } : a
    )
  })),

  updateAgentPixelPosition: (agentId, pixelX, pixelY) => set((state) => ({
    agents: state.agents.map((a) =>
      a.id === agentId ? { ...a, pixelX, pixelY } : a
    )
  })),

  arriveAtTarget: (agentId) => set((state) => ({
    agents: state.agents.map((a) => {
      if (a.id === agentId) {
        const isWorkstation = state.workstations.some(w => w.x === a.targetX && w.y === a.targetY);
        const isRestSpot = state.restSpots.some(r => r.x === a.targetX && r.y === a.targetY);
        let nextStatus: AgentStatus = 'idle';
        if (isWorkstation) nextStatus = 'working';
        if (isRestSpot) nextStatus = 'resting';

        return { ...a, gridX: a.targetX, gridY: a.targetY, status: nextStatus };
      }
      return a;
    })
  })),

  setAgentStatus: (agentId, status) => set((state) => ({
    agents: state.agents.map((a) =>
      a.id === agentId ? { ...a, status } : a
    )
  })),

  refreshAgents: async () => {
    try {
      const response = await fetch('http://localhost:5501/api/agents');
      if (!response.ok) throw new Error('Fetch failed');
      const backendAgents = await response.json();

      set((state) => {
        const updatedAgents = backendAgents.map((ba: any) => {
          const existing = state.agents.find(a => a.id === ba.id);
          
          // Determine status from backend if it's 'working', otherwise keep existing or 'idle'
          // If the agent is currently walking, keep it walking until it arrives
          let status: AgentStatus = ba.status as AgentStatus;
          if (existing?.status === 'walking') {
            status = 'walking';
          }

          if (existing) {
            // Keep current positions, only update status and info
            return { 
              ...existing, 
              name: ba.name, 
              workingDirectory: ba.workingDirectory,
              status: ba.status as AgentStatus,
              latestTaskPrompt: ba.latestTaskPrompt,
              latestTaskId: ba.latestTaskId,
            };
          } else {
            // New agent
            const color = [0x58A6FF, 0xBC8CFF, 0x3FB950, 0xD29922, 0xF85149, 0x8B949E][state.agents.length % 6];
            const x = 2 + (state.agents.length % 10);
            const y = 4;
            
            return {
              id: ba.id,
              name: ba.name,
              status: ba.status as AgentStatus,
              color: color,
              gridX: x,
              gridY: y,
              targetX: x,
              targetY: y,
              pixelX: x * TILE_SIZE,
              pixelY: y * TILE_SIZE,
              workingDirectory: ba.workingDirectory,
              latestTaskPrompt: ba.latestTaskPrompt,
              latestTaskId: ba.latestTaskId,
            };
          }
        });

        return { agents: updatedAgents };
      });
    } catch (err) {
      console.error('Failed to refresh agents:', err);
    }
  }
}));
