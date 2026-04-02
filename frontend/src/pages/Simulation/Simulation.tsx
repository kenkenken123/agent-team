import React, { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { Card, Typography, Tag, Space, Spin } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { OfficeState } from '../../office/engine/officeState.js';
import { OfficeCanvas } from '../../office/components/OfficeCanvas.js';
import { loadAllAssets } from '../../office/assetLoader.js';
import { setCharacterTemplates } from '../../office/sprites/spriteData.js';
import { setFloorSprites } from '../../office/floorTiles.js';
import { setWallSprites } from '../../office/wallTiles.js';
import './Simulation.css';

const SimulationPage: React.FC = () => {
  const agents = useGameStore(state => state.agents);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const officeStateRef = useRef<OfficeState | null>(null);
  
  // Zoom and Pan state for OfficeCanvas
  const [zoom, setZoom] = useState(2); // Pixel art usually looks better at 2x or 3x
  const panRef = useRef({ x: 0, y: 0 });

  // 1. Load Assets
  useEffect(() => {
    let mounted = true;
    loadAllAssets().then(assets => {
      if (!mounted) return;
      
      // Initialize global sprite data
      setCharacterTemplates(assets.characters);
      setFloorSprites(assets.floors);
      setWallSprites(assets.walls);
      
      // Initialize OfficeState with default layout
      const os = new OfficeState(assets.defaultLayout);
      officeStateRef.current = os;
      
      setAssetsLoaded(true);
    }).catch(err => {
      console.error('Failed to load assets:', err);
    });
    
    return () => { mounted = false; };
  }, []);

  // 2. Sync Zustand Agents to OfficeState
  useEffect(() => {
    if (!assetsLoaded || !officeStateRef.current) return;
    const os = officeStateRef.current;

    agents.forEach((agent) => {
      // Map string ID to numeric ID for officeState (e.g., 'agent-1' -> 1)
      const numericId = parseInt(agent.id.replace('agent-', ''), 10) || 0;
      
      if (!os.characters.has(numericId)) {
        // Add new agent to simulation
        os.addAgent(numericId, numericId % 6); // Use id for palette
      }
      
      // Update agent state
      // Mapping: working -> isActive=true, tool='Write'
      //          resting/idle -> isActive=false
      const isActive = agent.status === 'working';
      os.setAgentActive(numericId, isActive);
      os.setAgentTool(numericId, isActive ? 'Write' : null);
      
      // Handle walking target
      if (agent.status === 'walking') {
        const ch = os.characters.get(numericId);
        if (ch && (ch.tileCol !== agent.targetX || ch.tileRow !== agent.targetY)) {
          // Trigger pathfinding in OfficeState
          os.walkToTile(numericId, agent.targetX, agent.targetY);
        }
      }
    });

    // Auto-follow first agent if none selected and agents exist
    if (os.cameraFollowId === null && agents.length > 0) {
      const firstNumericId = parseInt(agents[0].id.replace('agent-', ''), 10) || 0;
      os.cameraFollowId = firstNumericId;
    }
  }, [agents, assetsLoaded]);

  const handleAgentClick = (id: number) => {
    console.log('Clicked agent:', id);
    // You could select the agent in your UI here
  };

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
            zoom={zoom}
            onZoomChange={setZoom}
            panRef={panRef}
          />
        </div>

        <div className="simulation-controls">
          <Typography.Title level={4} style={{ color: '#F0F6FC', marginBottom: 20 }}>
            指挥中心
          </Typography.Title>
          <div className="agents-list-scroll">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              {agents.map(agent => (
                <Card key={agent.id} className="agent-control-card" size="small">
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
