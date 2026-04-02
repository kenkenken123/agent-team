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
  agents: INITIAL_AGENTS,
  workstations: [
    { x: 2, y: 2 }, { x: 11, y: 2 },
    { x: 2, y: 7 }, { x: 11, y: 7 }
  ],
  restSpots: [
    { x: 9, y: 9 }, { x: 10, y: 9 }
  ],

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
  }))
}));
