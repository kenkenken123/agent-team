import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { Card, Typography, Tag, Space, Spin, Drawer, Button } from 'antd';
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
  const [hoveredAgentInfo, setHoveredAgentInfo] = useState<{ id: string; x: number; y: number } | null>(null);
  
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

  const { setPage, setSelectedAgentId, setInitialConsoleTab } = useAppStore();
  const detailAgent = agents.find(a => a.id === selectedDetailAgentId);

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

  const handleHover = useCallback((id: number | null, x?: number, y?: number) => {
    if (id === null || x === undefined || y === undefined) {
      setHoveredAgentInfo(null);
    } else {
      const guid = numericToGuidMap.current.get(id);
      if (guid) {
        setHoveredAgentInfo({ id: guid, x, y });
      } else {
        setHoveredAgentInfo(null);
      }
    }
  }, [numericToGuidMap]);

  if (!assetsLoaded) {
    return (
      <div className="simulation-loading">
        <Spin size="large" tip="载入赛博世界资产..." />
      </div>
    );
  }

  const currentHoveredAgent = hoveredAgentInfo ? agents.find(a => a.id === hoveredAgentInfo.id) : null;

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
          {currentHoveredAgent && hoveredAgentInfo && (
            <div 
              className="agent-hover-card"
              key={currentHoveredAgent.id}
              style={{
                left: hoveredAgentInfo.x,
                top: hoveredAgentInfo.y,
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
