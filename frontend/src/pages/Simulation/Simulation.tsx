import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { Typography, Tag, Spin, Drawer, Button } from 'antd';
import { RobotOutlined, MessageOutlined, CodeOutlined } from '@ant-design/icons';
import { OfficeState } from '../../office/engine/officeState.js';
import { OfficeCanvas } from '../../office/components/OfficeCanvas.js';
import { loadAllAssets } from '../../office/assetLoader.js';
import { setCharacterTemplates } from '../../office/sprites/spriteData.js';
import { setFloorSprites } from '../../office/floorTiles.js';
import { setWallSprites } from '../../office/wallTiles.js';
import { buildDynamicCatalog } from '../../office/layout/furnitureCatalog.js';
import { CharacterState } from '../../office/types.js';
import { useAppStore } from '../../stores/appStore';
import './Simulation.css';

// 优化：将 hover 卡片提取为独立组件，使用 React.memo 避免不必要的重渲染
const AgentHoverCard = React.memo(({
  agent,
  position,
  getFunnyIdleMessage
}: {
  agent: any;
  position: { x: number; y: number };
  getFunnyIdleMessage: (id: string) => string;
}) => {
  if (!agent || !position) return null;

  return (
    <div
      className="agent-hover-card"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="card-glare" />
      <div className="card-header">
        <RobotOutlined className="card-icon" style={{ color: `#${agent.color.toString(16).padStart(6, '0')}` }} />
        <div className="card-title">{agent.name}</div>
      </div>
      <div className="card-body">
        <div className="info-item">
          <span className="label">状态:</span>
          <Tag color={
            agent.status === 'working' ? 'success' :
            agent.status === 'walking' ? 'processing' : 'default'
          }>
            {agent.status === 'working' ? '工作中' :
             agent.status === 'walking' ? '移动中' :
             agent.status === 'resting' ? '休息中' : '空闲'}
          </Tag>
        </div>
        <div className="info-item">
          <span className="label">执行目录:</span>
          <div className="path-text" title={agent.workingDirectory}>
            {agent.workingDirectory}
          </div>
        </div>
        <div className="info-item">
          <span className="label">最新进度:</span>
          <div className="progress-text" style={{ color: '#58A6FF', fontSize: 12, marginTop: 4 }}>
            {agent.status === 'working'
              ? (agent.latestTaskPrompt ? (agent.latestTaskPrompt.length > 50 ? agent.latestTaskPrompt.substring(0, 47) + '...' : agent.latestTaskPrompt) : '同步中...')
              : getFunnyIdleMessage(agent.id)}
          </div>
        </div>
      </div>
    </div>
  );
});

AgentHoverCard.displayName = 'AgentHoverCard';

const SimulationPage: React.FC = () => {
  // 优化：使用选择器订阅 agents 数组长度和具体内容，减少不必要重渲染
  const agents = useGameStore(state => state.agents);
  const refreshAgents = useGameStore(state => state.refreshAgents);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const officeStateRef = useRef<OfficeState | null>(null);

  // 0. Polling Backend for Agent States
  useEffect(() => {
    refreshAgents(); // Initial fetch
    const interval = setInterval(() => {
      refreshAgents();
    }, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, [refreshAgents]);

  // Zoom and Pan state for OfficeCanvas
  const [zoom, setZoom] = useState(2); // Pixel art usually looks better at 2x or 3x
  const panRef = useRef({ x: 0, y: 0 });
  // 优化：使用 useRef 存储 hover 位置，避免频繁 setState 触发重渲染
  const hoverPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [hoverAgentId, setHoverAgentId] = useState<string | null>(null);

  // Detail Panel State
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedDetailAgentId, setSelectedDetailAgentId] = useState<string | null>(null);


  // 1. Load Assets
  useEffect(() => {
    let mounted = true;
    loadAllAssets().then(assets => {
      if (!mounted) return;

      // Initialize global sprite data
      setCharacterTemplates(assets.characters);
      setFloorSprites(assets.floors);
      setWallSprites(assets.walls);
      buildDynamicCatalog({ catalog: assets.furnitureCatalog, sprites: Object.fromEntries(assets.furnitureSprites) });

      // Initialize OfficeState with default layout
      const os = new OfficeState(assets.defaultLayout);
      officeStateRef.current = os;

      setAssetsLoaded(true);
    }).catch(err => {
      console.error('Failed to load assets:', err);
    });

    return () => { mounted = false; };
  }, []);

  // 优化：使用 useRef 存储映射，避免每次 render 创建新对象
  const guidToNumericMap = useRef<Map<string, number>>(new Map());
  const numericToGuidMap = useRef<Map<number, string>>(new Map());
  // 优化：存储上次处理的 agents 快照，用于变化检测
  const lastAgentsSnapshot = useRef<Map<string, { status: string; workingDirectory?: string; latestTaskPrompt?: string; latestTaskId?: string }>>(new Map());

  // 2. Sync Zustand Agents to OfficeState (优化：仅在数据真正变化时执行)
  useEffect(() => {
    if (!assetsLoaded || !officeStateRef.current) return;
    const os = officeStateRef.current;

    // 优化：检测 agents 是否真正变化
    let hasSignificantChanges = false;

    for (const agent of agents) {
      const snapshot = lastAgentsSnapshot.current.get(agent.id);
      if (!snapshot) {
        hasSignificantChanges = true; // 新 agent
        break;
      }
      if (
        snapshot.status !== agent.status ||
        snapshot.workingDirectory !== agent.workingDirectory ||
        snapshot.latestTaskPrompt !== agent.latestTaskPrompt ||
        snapshot.latestTaskId !== agent.latestTaskId
      ) {
        hasSignificantChanges = true;
        break;
      }
    }

    // 检查是否有 agent 被移除
    if (!hasSignificantChanges && agents.length !== lastAgentsSnapshot.current.size) {
      hasSignificantChanges = true;
    }

    // 更新快照
    const newSnapshot = new Map();
    for (const agent of agents) {
      newSnapshot.set(agent.id, {
        status: agent.status,
        workingDirectory: agent.workingDirectory,
        latestTaskPrompt: agent.latestTaskPrompt,
        latestTaskId: agent.latestTaskId,
      });
    }
    lastAgentsSnapshot.current = newSnapshot;

    // 如果无显著变化，跳过 OfficeState 同步
    if (!hasSignificantChanges) return;

    agents.forEach((agent) => {
      // Ensure numeric ID exists
      let numericId = guidToNumericMap.current.get(agent.id);
      if (numericId === undefined) {
          numericId = guidToNumericMap.current.size + 1;
          guidToNumericMap.current.set(agent.id, numericId);
          numericToGuidMap.current.set(numericId, agent.id);
      }

      if (!os.characters.has(numericId)) {
        os.addAgent(numericId, numericId % 6);
      }

      const ch = os.characters.get(numericId);
      if (!ch) return;

      const isWorking = agent.status === 'working';

      // If status is working, Ensure character is at their seat or moving to it
      if (isWorking) {
        if (!ch.isActive) {
           os.setAgentActive(numericId, true);
           os.setAgentTool(numericId, 'Write');
        }
        // Force move to seat if not already there and not walking
        if (ch.seatId && ch.state !== CharacterState.WALK) {
           const seat = os.seats.get(ch.seatId);
           if (seat && (ch.tileCol !== seat.seatCol || ch.tileRow !== seat.seatRow)) {
              os.sendToSeat(numericId);
           }
        }
      } else if (agent.status === 'resting') {
         if (ch.isActive) {
           os.setAgentActive(numericId, false);
           os.setAgentTool(numericId, null);
         }
      } else {
         if (ch.isActive) os.setAgentActive(numericId, false);
      }

      // Handle manual walking target from store (if any)
      if (agent.status === 'walking') {
        if (ch.tileCol !== agent.targetX || ch.tileRow !== agent.targetY) {
          os.walkToTile(numericId, agent.targetX, agent.targetY);
        }
      }
    });


  }, [agents, assetsLoaded]);

  const { setPage, setSelectedAgentId, setInitialConsoleTab } = useAppStore();

  // 优化：使用 useMemo 缓存 detailAgent 查找
  const detailAgent = useMemo(() =>
    agents.find(a => a.id === selectedDetailAgentId),
    [agents, selectedDetailAgentId]
  );

  const handleAgentClick = (id: number) => {
    const guid = numericToGuidMap.current.get(id);
    if (guid) {
      setSelectedDetailAgentId(guid);
      setDetailVisible(true);
    }
  };

  const jumpToConsole = (tab: 'output' | 'terminal') => {
    if (selectedDetailAgentId) {
      setSelectedAgentId(selectedDetailAgentId);
      setInitialConsoleTab(tab);
      setPage('console');
    }
  };

  // Funny idle messages
  const getFunnyIdleMessage = useCallback((agentId: string) => {
    const messages = ["摸鱼ing", "抽根烟", "在玩黑神话", "发呆中...", "偷看股票", "刷短视频", "思考人生", "正在喝咖啡", "蹲厕所中"];
    // Deterministic random based on ID hash
    const hash = agentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return messages[hash % messages.length];
  }, []);

  // 优化：使用 useMemo 缓存当前 hover agent 查找
  const currentHoveredAgent = useMemo(() =>
    hoverAgentId ? agents.find(a => a.id === hoverAgentId) : null,
    [agents, hoverAgentId]
  );

  const handleHover = useCallback((id: number | null, x?: number, y?: number) => {
    if (id === null || x === undefined || y === undefined) {
      setHoverAgentId(null);
      hoverPositionRef.current = null;
    } else {
      const guid = numericToGuidMap.current.get(id);
      if (guid) {
        setHoverAgentId(guid);
        hoverPositionRef.current = { x, y };
      } else {
        setHoverAgentId(null);
        hoverPositionRef.current = null;
      }
    }
  }, []);

  if (!assetsLoaded) {
    return (
      <div className="simulation-loading">
        <Spin size="large" tip="载入赛博世界资产..." />
      </div>
    );
  }

  return (
    <div className="simulation-page">
      <div className="simulation-header">
        <Typography.Title level={2} style={{ margin: 0, color: '#F0F6FC' }}>
          赛博世界 <Tag color="blue">PIXEL OFFICE</Tag>
        </Typography.Title>
        <Typography.Text type="secondary" style={{ color: '#8b949e' }}>
          基于 Pixel Agents 引擎的实时像素办公室模拟
        </Typography.Text>
      </div>

      <div className="simulation-content">
        <div className="game-canvas-container">
          <OfficeCanvas
            officeState={officeStateRef.current!}
            onClick={handleAgentClick}
            onHover={handleHover}
            zoom={zoom}
            onZoomChange={setZoom}
            panRef={panRef}
          />

          {/* 优化：使用 React.memo 组件避免不必要的重渲染 */}
          {currentHoveredAgent && hoverPositionRef.current && (
            <AgentHoverCard
              agent={currentHoveredAgent}
              position={hoverPositionRef.current}
              getFunnyIdleMessage={getFunnyIdleMessage}
            />
          )}
        </div>
      </div>


      {/* Agent Detail Drawer */}
      <Drawer
        title={
          <div className="detail-drawer-header">
            <RobotOutlined style={{
              fontSize: 28,
              color: detailAgent ? `#${detailAgent.color.toString(16).padStart(6, '0')}` : '#58A6FF',
              filter: 'drop-shadow(0 0 8px rgba(88, 166, 255, 0.4))'
            }} />
            <div className="title-area">
              <div className="agent-name">{detailAgent?.name || 'Agent 详情'}</div>
              <Tag color={
                detailAgent?.status === 'working' ? 'success' :
                detailAgent?.status === 'walking' ? 'processing' : 'default'
              }>
                {detailAgent?.status === 'working' ? '正在工作中' :
                 detailAgent?.status === 'walking' ? '正在移动' :
                 detailAgent?.status === 'resting' ? '正在休息' : '空闲待命'}
              </Tag>
            </div>
          </div>
        }
        placement="right"
        onClose={() => setDetailVisible(false)}
        open={detailVisible}
        width={400}
        className="simulation-detail-drawer"
      >
        {detailAgent && (
          <div className="detail-content">
            <div className="section">
              <div className="section-title">核心信息</div>
              <div className="info-grid">
                <div className="grid-item">
                  <span className="label">状态</span>
                  <span className="value" style={{
                    color: detailAgent.status === 'working' ? '#3FB950' :
                           detailAgent.status === 'walking' ? '#58A6FF' :
                           detailAgent.status === 'resting' ? '#D29922' : '#8B949E'
                  }}>
                    {detailAgent.status === 'working' ? '工作中' :
                     detailAgent.status === 'walking' ? '移动中' :
                     detailAgent.status === 'resting' ? '休息中' : '待命'}
                  </span>
                </div>
                <div className="grid-item">
                  <span className="label">标识符</span>
                  <span className="value">#{detailAgent.id.substring(0, 8)}</span>
                </div>
              </div>
            </div>

            <div className="section">
              <div className="section-title">工作目录</div>
              <div className="path-display">
                {detailAgent.workingDirectory}
              </div>
            </div>

            <div className="section">
              <div className="section-title">活跃任务 / 状态</div>
              <div className="prompt-display">
                {detailAgent.status === 'working'
                  ? (detailAgent.latestTaskPrompt || '任务载入中...')
                  : getFunnyIdleMessage(detailAgent.id)}
              </div>
            </div>

            <div className="drawer-footer-actions">
              <Button
                type="primary"
                block
                size="large"
                icon={<MessageOutlined />}
                onClick={() => jumpToConsole('output')}
                className="action-btn chat-btn"
              >
                跳转到控制台对话框
              </Button>
              <Button
                block
                size="large"
                icon={<CodeOutlined />}
                onClick={() => jumpToConsole('terminal')}
                className="action-btn terminal-btn"
              >
                跳转到控制台终端
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default SimulationPage;
