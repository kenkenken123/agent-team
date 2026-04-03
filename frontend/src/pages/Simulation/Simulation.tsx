import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { Card, Typography, Tag, Space, Spin } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
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

const SimulationPage: React.FC = () => {
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
  const [hoveredAgentInfo, setHoveredAgentInfo] = useState<{ id: string | null; x: number; y: number }>({ id: null, x: 0, y: 0 });


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

  // Stable mapping from GUID to Numeric ID for OfficeState
  const [guidToNumericMap] = useState<Map<string, number>>(new Map());
  const numericToGuidMap = useRef<Map<number, string>>(new Map());

  // 2. Sync Zustand Agents to OfficeState
  useEffect(() => {
    if (!assetsLoaded || !officeStateRef.current) return;
    const os = officeStateRef.current;

    agents.forEach((agent) => {
      // Ensure numeric ID exists
      let numericId = guidToNumericMap.get(agent.id);
      if (numericId === undefined) {
          numericId = guidToNumericMap.size + 1;
          guidToNumericMap.set(agent.id, numericId);
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


  }, [agents, assetsLoaded, guidToNumericMap]);

  const { setPage, setSelectedAgentId } = useAppStore();

  const handleAgentClick = (id: number) => {
    const guid = numericToGuidMap.current.get(id);
    if (guid) {
      setSelectedAgentId(guid);
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

  const handleHover = (id: number | null, x?: number, y?: number) => {
    if (id === null) {
      setHoveredAgentInfo({ id: null, x: 0, y: 0 });
    } else {
      const guid = numericToGuidMap.current.get(id);
      setHoveredAgentInfo({ id: guid || null, x: x || 0, y: y || 0 });
    }
  };

  if (!assetsLoaded) {
    return (
      <div className="simulation-loading">
        <Spin size="large" tip="载入赛博世界资产..." />
      </div>
    );
  }

  const currentHoveredAgent = agents.find(a => a.id === hoveredAgentInfo.id);

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

          {/* Hover Detail Card */}
          {currentHoveredAgent && (
            <div 
              className="agent-hover-card"
              style={{
                left: hoveredAgentInfo.x + 15,
                top: hoveredAgentInfo.y + 15,
              }}
            >
              <div className="card-glare" />
              <div className="card-header">
                <RobotOutlined className="card-icon" style={{ color: `#${currentHoveredAgent.color.toString(16).padStart(6, '0')}` }} />
                <div className="card-title">{currentHoveredAgent.name}</div>
              </div>
              <div className="card-body">
                <div className="info-item">
                  <span className="label">状态:</span>
                  <Tag color={
                    currentHoveredAgent.status === 'working' ? 'success' : 
                    currentHoveredAgent.status === 'walking' ? 'processing' : 'default'
                  }>
                    {currentHoveredAgent.status === 'working' ? '工作中' : 
                     currentHoveredAgent.status === 'walking' ? '移动中' : 
                     currentHoveredAgent.status === 'resting' ? '休息中' : '空闲'}
                  </Tag>
                </div>
                <div className="info-item">
                  <span className="label">执行目录:</span>
                  <div className="path-text" title={currentHoveredAgent.workingDirectory}>
                    {currentHoveredAgent.workingDirectory}
                  </div>
                </div>
                <div className="info-item">
                  <span className="label">最新进度:</span>
                  <div className="progress-text" style={{ color: '#58A6FF', fontSize: 12, marginTop: 4 }}>
                    {currentHoveredAgent.status === 'working' 
                      ? (currentHoveredAgent.latestTaskPrompt ? (currentHoveredAgent.latestTaskPrompt.length > 50 ? currentHoveredAgent.latestTaskPrompt.substring(0, 47) + '...' : currentHoveredAgent.latestTaskPrompt) : '同步中...')
                      : getFunnyIdleMessage(currentHoveredAgent.id)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="simulation-controls">
          <Typography.Title level={4} style={{ color: '#F0F6FC', marginBottom: 20 }}>
            指挥中心
          </Typography.Title>
          <div className="agents-list-scroll">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              {agents.map(agent => (
                <Card 
                  key={agent.id} 
                  className="agent-control-card" 
                  size="small"
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setPage('console');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="agent-info">
                    <RobotOutlined style={{ fontSize: 24, color: `#${agent.color.toString(16).padStart(6, '0')}` }} />
                    <div className="name-status">
                      <div className="name" style={{ color: '#F0F6FC' }}>{agent.name}</div>
                      <div className="status-tag">
                        {agent.status === 'idle' && <Tag color="default">待命</Tag>}
                        {agent.status === 'walking' && <Tag color="processing">移动中...</Tag>}
                        {agent.status === 'working' && <Tag color="success">工作中</Tag>}
                        {agent.status === 'resting' && <Tag color="warning">休息中</Tag>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </Space>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationPage;
