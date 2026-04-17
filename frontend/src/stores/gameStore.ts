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

export const useGameStore = create<GameState>((set) => ({
  companyMap: [],
  agents: [],
  workstations: [],
  restSpots: [],

  moveAgent: (agentId, targetX, targetY) => set((state) => {
    // 优化：仅当目标位置变化时才更新
    const agent = state.agents.find(a => a.id === agentId);
    if (agent && agent.targetX === targetX && agent.targetY === targetY && agent.status === 'walking') {
      return {}; // 无变化，跳过更新
    }
    return {
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, targetX, targetY, status: 'walking' } : a
      )
    };
  }),

  updateAgentPixelPosition: (agentId, pixelX, pixelY) => set((state) => {
    // 优化：仅当像素位置变化时才更新
    const agent = state.agents.find(a => a.id === agentId);
    if (agent && agent.pixelX === pixelX && agent.pixelY === pixelY) {
      return {}; // 无变化，跳过更新
    }
    return {
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, pixelX, pixelY } : a
      )
    };
  }),

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

  setAgentStatus: (agentId, status) => set((state) => {
    // 优化：仅当状态变化时才更新
    const agent = state.agents.find(a => a.id === agentId);
    if (agent && agent.status === status) {
      return {}; // 无变化，跳过更新
    }
    return {
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, status } : a
      )
    };
  }),

  refreshAgents: async () => {
    try {
      const response = await fetch('http://localhost:5501/api/agents');
      if (!response.ok) throw new Error('Fetch failed');
      const backendAgents = await response.json();

      set((state) => {
        // 优化：深度比较检测数据是否真正变化
        let hasChanges = false;

        // 检查数量变化
        if (backendAgents.length !== state.agents.length) {
          hasChanges = true;
        } else {
          // 检查每个 agent 的关键字段
          for (const ba of backendAgents) {
            const existing = state.agents.find(a => a.id === ba.id);
            if (!existing) {
              hasChanges = true; // 新 agent
              break;
            }
            // 检查可能变化的字段
            if (
              existing.name !== ba.name ||
              existing.status !== ba.status ||
              existing.workingDirectory !== ba.workingDirectory ||
              existing.latestTaskPrompt !== ba.latestTaskPrompt ||
              existing.latestTaskId !== ba.latestTaskId
            ) {
              hasChanges = true;
              break;
            }
          }
        }

        // 如果数据无变化，跳过更新（避免触发不必要的重渲染）
        if (!hasChanges) {
          return {};
        }

        const updatedAgents = backendAgents.map((ba: any) => {
          const existing = state.agents.find(a => a.id === ba.id);

          // Determine status from backend if it's 'working', otherwise keep existing or 'idle'
          // If the agent is currently walking, keep it walking until it arrives
          const effectiveStatus: AgentStatus =
            existing?.status === 'walking' ? 'walking' : (ba.status as AgentStatus);

          if (existing) {
            // Keep current positions, only update status and info
            return {
              ...existing,
              name: ba.name,
              workingDirectory: ba.workingDirectory,
              status: effectiveStatus,
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
              status: effectiveStatus,
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
