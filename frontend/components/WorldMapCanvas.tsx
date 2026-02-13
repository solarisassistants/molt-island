"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Application, Graphics, Text, TextStyle, Container } from "pixi.js";

interface Agent {
  id: string;
  name: string;
  zone: string;
  status: string;
  level?: number;
  hp?: number;
  maxHp?: number;
  position?: { x: number; y: number };
}

interface NPC {
  id: string;
  type: string;
  level: number;
  hp: number;
  maxHp: number;
  position: { x: number; y: number };
  zone: string;
}

interface CombatEvent {
  id: string;
  type: string;
  timestamp: number;
  agentId?: string;
  targetId?: string;
  data: {
    damage?: number;
    positionX?: number;
    positionY?: number;
  };
}

interface WorldMapCanvasProps {
  agents: Agent[];
  npcs?: NPC[];
  combatEvents?: CombatEvent[];
  onZoneClick?: (zone: string) => void;
  onAgentClick?: (agent: Agent) => void;
  selectedAgentId?: string | null;
  worldBounds?: Record<string, { minX: number; maxX: number; minY: number; maxY: number }>;
}

const ZONE_COLORS = {
  shallows: { fill: 0x0D4F4F, border: 0x00CCCC, label: "SHALLOWS" },
  awakening: { fill: 0x4F4F0D, border: 0xCCCC00, label: "AWAKENING" },
  volcano: { fill: 0x4F0D0D, border: 0xCC3333, label: "VOLCANO" },
};

const AGENT_COLORS = {
  alive: 0x00FF88,
  dead: 0xFF3B3B,
  selected: 0xFFFFFF,
  top3: 0xFFD700, // Gold for top 3
  npc: 0xFF8800, // Orange for NPCs
  lowHp: 0xFFFF00, // Yellow for low HP warning
};

// Deterministic hash for stable positioning
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Seeded random for stable agent positions
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function WorldMapCanvas({
  agents,
  npcs = [],
  combatEvents = [],
  onZoneClick,
  onAgentClick,
  selectedAgentId,
  worldBounds,
}: WorldMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [hoveredAgent, setHoveredAgent] = useState<Agent | null>(null);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Memoize agents by zone to avoid recalculating
  const agentsByZone = useMemo(() => {
    const byZone: Record<string, Agent[]> = {
      shallows: [],
      awakening: [],
      volcano: [],
    };
    agents.forEach((agent) => {
      if (byZone[agent.zone]) {
        byZone[agent.zone].push(agent);
      }
    });
    return byZone;
  }, [agents]);

  // Get top 3 agent IDs for special styling
  const top3Ids = useMemo(() => {
    return [...agents]
      .filter(a => a.status === "alive")
      .sort((a, b) => (b.level || 1) - (a.level || 1))
      .slice(0, 3)
      .map(a => a.id);
  }, [agents]);

  // Calculate stable position for an agent
  const getAgentPosition = useCallback((agent: Agent, zoneIndex: number, zoneWidth: number, height: number) => {
    const x = zoneIndex * zoneWidth;

    if (agent.position?.x !== undefined && agent.position?.y !== undefined) {
      const bounds = worldBounds?.[agent.zone];
      const rangeX = bounds ? Math.max(1, bounds.maxX - bounds.minX) : 100;
      const rangeY = bounds ? Math.max(1, bounds.maxY - bounds.minY) : 100;
      const normX = bounds ? (agent.position.x - bounds.minX) / rangeX : agent.position.x / 100;
      const normY = bounds ? (agent.position.y - bounds.minY) / rangeY : agent.position.y / 100;
      // Use actual position if available
      return {
        x: x + normX * (zoneWidth - 20) + 10,
        y: normY * (height - 60) + 40,
      };
    }

    // Generate stable position from agent ID
    const seed = hashCode(agent.id);
    const offsetX = seededRandom(seed) * (zoneWidth - 40) + 20;
    const offsetY = seededRandom(seed + 1) * (height - 80) + 50;

    return {
      x: x + offsetX,
      y: offsetY,
    };
  }, [worldBounds]);

  const tickerDataRef = useRef({
    agents,
    npcs,
    combatEvents,
    agentsByZone,
    selectedAgentId,
    top3Ids,
    worldBounds,
    getAgentPosition,
    setHoveredAgent,
    onAgentClick,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    let app: Application | null = null;
    let destroyed = false;
    let agentsContainer: Container | null = null;
    let labelsContainer: Container | null = null;
    let zoneContainers: Record<string, Container> = {};

    const init = async () => {
      try {
        app = new Application();

        await app.init({
          background: 0x000000,
          backgroundAlpha: 0,
          resizeTo: containerRef.current!,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        if (destroyed) {
          app.destroy(true);
          return;
        }

        appRef.current = app;
        containerRef.current!.appendChild(app.canvas as HTMLCanvasElement);

        const width = app.screen.width;
        const height = app.screen.height;
        const zoneWidth = width / 3;

        // Main container
        const mainContainer = new Container();
        app.stage.addChild(mainContainer);

        // Draw hex grid (static, drawn once)
        const gridGraphics = new Graphics();
        mainContainer.addChild(gridGraphics);
        drawHexGrid(gridGraphics, width, height);

        // Zone containers (static zones)
        const zones = ["shallows", "awakening", "volcano"] as const;

        zones.forEach((zone, index) => {
          const container = new Container();
          zoneContainers[zone] = container;
          mainContainer.addChild(container);

          const graphics = new Graphics();
          container.addChild(graphics);

          const x = index * zoneWidth;
          const colors = ZONE_COLORS[zone];

          // Draw zone with deterministic shape
          drawZonePolygon(graphics, x, 0, zoneWidth, height, colors.fill, colors.border, index);

          // Zone label
          const labelStyle = new TextStyle({
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            fill: 0xFFFFFF,
            fontWeight: "bold",
            letterSpacing: 1,
          });
          const label = new Text({ text: colors.label, style: labelStyle });
          label.x = x + 8;
          label.y = 6;
          label.alpha = 0.5;
          container.addChild(label);

          // Agent count badge
          const countStyle = new TextStyle({
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            fill: colors.border,
          });
          const countBadge = new Text({ text: "[0]", style: countStyle });
          countBadge.x = x + 8;
          countBadge.y = 18;
          countBadge.alpha = 0.7;
          countBadge.name = `${zone}-count`;
          container.addChild(countBadge);

          // Zone interaction
          graphics.eventMode = "static";
          graphics.cursor = "pointer";

          graphics.on("pointerover", () => {
            setHoveredZone(zone);
            graphics.alpha = 1.2;
          });

          graphics.on("pointerout", () => {
            setHoveredZone(null);
            graphics.alpha = 1;
          });

          graphics.on("pointertap", () => {
            onZoneClick?.(zone);
          });
        });

        // Agents container (updated each frame)
        agentsContainer = new Container();
        mainContainer.addChild(agentsContainer);

        // Labels container (for agent names)
        labelsContainer = new Container();
        mainContainer.addChild(labelsContainer);

        // Particles
        const particlesContainer = new Container();
        mainContainer.addChild(particlesContainer);

        const particles: { graphics: Graphics; vx: number; vy: number }[] = [];
        for (let i = 0; i < 12; i++) {
          const particle = new Graphics();
          particle.circle(0, 0, 1);
          particle.fill({ color: 0xFFFFFF, alpha: 0.06 });
          particle.x = seededRandom(i * 100) * width;
          particle.y = seededRandom(i * 100 + 50) * height;
          particlesContainer.addChild(particle);
          particles.push({
            graphics: particle,
            vx: (seededRandom(i * 200) - 0.5) * 0.2,
            vy: (seededRandom(i * 200 + 100) - 0.5) * 0.2,
          });
        }

        // Scan line
        const scanLine = new Graphics();
        scanLine.rect(0, 0, 1, height);
        scanLine.fill({ color: 0xFFFFFF, alpha: 0.02 });
        scanLine.x = -10;
        mainContainer.addChild(scanLine);

        // Animation state
        let scanLineProgress = 0;
        let pulsePhase = 0;

        // Store refs for the ticker to access
        app.ticker.add((ticker) => {
          const tickerData = tickerDataRef.current;
          const delta = ticker.deltaTime;
          pulsePhase += delta * 0.08;

          const agentById = new Map(tickerData.agents.map((a) => [a.id, a]));

          // Particles
          particles.forEach((p) => {
            p.graphics.x += p.vx * delta;
            p.graphics.y += p.vy * delta;
            if (p.graphics.x < 0) p.graphics.x = width;
            if (p.graphics.x > width) p.graphics.x = 0;
            if (p.graphics.y < 0) p.graphics.y = height;
            if (p.graphics.y > height) p.graphics.y = 0;
          });

          // Scan line
          scanLineProgress += delta * 0.3;
          if (scanLineProgress > width + 50) scanLineProgress = -10;
          scanLine.x = scanLineProgress;

          // Clear and redraw agents (destroy old objects to prevent GPU memory leak)
          if (agentsContainer) agentsContainer.removeChildren().forEach(c => c.destroy());
          if (labelsContainer) labelsContainer.removeChildren().forEach(c => c.destroy());

          zones.forEach((zone, zoneIndex) => {
            const zoneAgents = tickerData.agentsByZone[zone] || [];

            // Update count
            const countBadge = zoneContainers[zone]?.getChildByName(`${zone}-count`) as Text;
            if (countBadge) {
              const aliveCount = zoneAgents.filter(a => a.status === "alive").length;
              countBadge.text = `[${aliveCount}]`;
            }

            zoneAgents.forEach((agent) => {
              const pos = tickerData.getAgentPosition(agent, zoneIndex, zoneWidth, height);
              const isAlive = agent.status === "alive";
              const isSelected = agent.id === tickerData.selectedAgentId;
              const isTop3 = tickerData.top3Ids.includes(agent.id);
              const level = agent.level || 1;

              // Base size scales with level (3-8px)
              const baseSize = Math.min(3 + level * 0.4, 8);
              const pulse = isAlive ? 1 + Math.sin(pulsePhase + hashCode(agent.id) * 0.1) * 0.1 : 1;
              const size = baseSize * pulse;

              const blip = new Graphics();

              // Selection ring
              if (isSelected) {
                blip.circle(0, 0, size + 6);
                blip.stroke({ color: AGENT_COLORS.selected, width: 1, alpha: 0.8 });
              }

              // Top 3 crown/ring
              if (isTop3 && isAlive) {
                blip.circle(0, 0, size + 4);
                blip.fill({ color: AGENT_COLORS.top3, alpha: 0.15 });
                blip.stroke({ color: AGENT_COLORS.top3, width: 1, alpha: 0.5 });
              }

              // Glow for alive agents
              if (isAlive) {
                blip.circle(0, 0, size + 2);
                blip.fill({ color: AGENT_COLORS.alive, alpha: 0.15 });
              }

              // Main blip
              const color = isAlive ? AGENT_COLORS.alive : AGENT_COLORS.dead;
              blip.circle(0, 0, size);
              blip.fill({ color, alpha: isAlive ? 0.9 : 0.4 });

              blip.x = pos.x;
              blip.y = pos.y;

              // Interaction
              blip.eventMode = "static";
              blip.cursor = "pointer";
              blip.hitArea = { contains: (x: number, y: number) => x * x + y * y < (size + 5) * (size + 5) };

              blip.on("pointerover", () => tickerData.setHoveredAgent(agent));
              blip.on("pointerout", () => tickerData.setHoveredAgent(null));
              blip.on("pointertap", (e) => {
                e.stopPropagation();
                tickerData.onAgentClick?.(agent);
              });

              agentsContainer!.addChild(blip);

              // Show name label for top 3 or selected
              if ((isTop3 || isSelected) && isAlive && labelsContainer) {
                const nameStyle = new TextStyle({
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 8,
                  fill: isSelected ? 0xFFFFFF : AGENT_COLORS.top3,
                  fontWeight: isSelected ? "bold" : "normal",
                });
                const nameLabel = new Text({ text: agent.name.slice(0, 10), style: nameStyle });
                nameLabel.x = pos.x - nameLabel.width / 2;
                nameLabel.y = pos.y - size - 10;
                nameLabel.alpha = 0.8;
                labelsContainer.addChild(nameLabel);
              }
            });
          });

          // Draw NPCs as triangles
          tickerData.npcs.forEach((npc) => {
            let zoneIndex = zones.indexOf(npc.zone as typeof zones[number]);
            if (zoneIndex < 0) {
              if (npc.position.x > 66) zoneIndex = 2;
              else if (npc.position.x > 33) zoneIndex = 1;
              else zoneIndex = 0;
            }

            const bounds = tickerData.worldBounds?.[npc.zone];
            const rangeX = bounds ? Math.max(1, bounds.maxX - bounds.minX) : 100;
            const rangeY = bounds ? Math.max(1, bounds.maxY - bounds.minY) : 100;
            const normX = bounds ? (npc.position.x - bounds.minX) / rangeX : npc.position.x / 100;
            const normY = bounds ? (npc.position.y - bounds.minY) / rangeY : npc.position.y / 100;

            const npcX = zoneIndex * zoneWidth + normX * (zoneWidth - 20) + 10;
            const npcY = normY * (height - 60) + 40;

            const npcSize = Math.min(4 + npc.level * 0.5, 10);
            const hpPercent = npc.hp / npc.maxHp;

            const npcBlip = new Graphics();

            // Draw triangle for NPC
            const trianglePoints = [
              npcX, npcY - npcSize,           // top
              npcX - npcSize, npcY + npcSize, // bottom left
              npcX + npcSize, npcY + npcSize, // bottom right
            ];
            npcBlip.poly(trianglePoints);
            npcBlip.fill({ color: AGENT_COLORS.npc, alpha: 0.7 * hpPercent + 0.3 });
            npcBlip.stroke({ color: AGENT_COLORS.npc, width: 1, alpha: 0.5 });

            agentsContainer!.addChild(npcBlip);

            // NPC type label
            if (labelsContainer && npc.type === "boss_dragon") {
              const bossStyle = new TextStyle({
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 7,
                fill: 0xFF4400,
                fontWeight: "bold",
              });
              const bossLabel = new Text({ text: "BOSS", style: bossStyle });
              bossLabel.x = npcX - bossLabel.width / 2;
              bossLabel.y = npcY - npcSize - 10;
              bossLabel.alpha = 0.9;
              labelsContainer.addChild(bossLabel);
            }
          });

          // Draw combat effects (attack lines)
          tickerData.combatEvents.forEach((event) => {
            if (event.data.positionX !== undefined && event.data.positionY !== undefined) {
              const eventAgent = event.agentId ? agentById.get(event.agentId) : undefined;
              const eventZone = eventAgent?.zone;
              const eventZoneIndex = eventZone ? zones.indexOf(eventZone as typeof zones[number]) : 0;
              const eventBounds = eventZone ? tickerData.worldBounds?.[eventZone] : undefined;
              const rangeX = eventBounds ? Math.max(1, eventBounds.maxX - eventBounds.minX) : 100;
              const rangeY = eventBounds ? Math.max(1, eventBounds.maxY - eventBounds.minY) : 100;
              const normX = eventBounds
                ? (event.data.positionX - eventBounds.minX) / rangeX
                : event.data.positionX / 100;
              const normY = eventBounds
                ? (event.data.positionY - eventBounds.minY) / rangeY
                : event.data.positionY / 100;

              const combatX = eventZoneIndex * zoneWidth + normX * (zoneWidth - 20) + 10;
              const combatY = normY * (height - 60) + 40;

              // Damage number
              if (event.data.damage && labelsContainer) {
                const age = Date.now() - event.timestamp;
                const fadeOut = Math.max(0, 1 - age / 3000);
                const floatUp = age * 0.02;

                const dmgStyle = new TextStyle({
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 9,
                  fill: 0xFF4444,
                  fontWeight: "bold",
                });
                const dmgText = new Text({ text: `-${event.data.damage}`, style: dmgStyle });
                dmgText.x = combatX - dmgText.width / 2;
                dmgText.y = combatY - 20 - floatUp;
                dmgText.alpha = fadeOut;
                labelsContainer.addChild(dmgText);
              }
            }
          });
        });

      } catch (err) {
        console.error("PixiJS init error:", err);
        setError("WebGL not supported");
      }
    };

    init();

    return () => {
      destroyed = true;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, []); // Only init once

  // Keep ticker data fresh without reinitializing PixiJS
  useEffect(() => {
    tickerDataRef.current = {
      ...tickerDataRef.current,
      agents,
      npcs,
      combatEvents,
      agentsByZone,
      selectedAgentId,
      top3Ids,
      worldBounds,
      getAgentPosition,
      onAgentClick,
    };
  }, [agents, npcs, combatEvents, agentsByZone, selectedAgentId, top3Ids, worldBounds, getAgentPosition, onAgentClick]);

  if (error) {
    return <FallbackMap agents={agents} selectedAgentId={selectedAgentId} onAgentClick={onAgentClick} />;
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Hover tooltip */}
      {hoveredAgent && (
        <div className="absolute bottom-2 left-2 bg-black/90 border border-border px-2 py-1 text-[10px] font-mono z-10">
          <div className="text-text-primary font-bold">{hoveredAgent.name}</div>
          <div className="text-text-secondary">
            Lv.{hoveredAgent.level || 1} · {hoveredAgent.zone.toUpperCase()} · {hoveredAgent.status.toUpperCase()}
          </div>
        </div>
      )}

      {/* Zone tooltip */}
      {hoveredZone && !hoveredAgent && (
        <div className="absolute bottom-2 left-2 bg-black/90 border border-border px-2 py-1 text-[10px] font-mono z-10">
          <div className="font-bold" style={{ color: `#${ZONE_COLORS[hoveredZone as keyof typeof ZONE_COLORS]?.border.toString(16).padStart(6, '0')}` }}>
            {ZONE_COLORS[hoveredZone as keyof typeof ZONE_COLORS]?.label}
          </div>
          <div className="text-text-secondary">
            {agentsByZone[hoveredZone]?.filter(a => a.status === "alive").length || 0} alive · {agentsByZone[hoveredZone]?.filter(a => a.status === "dead").length || 0} dead
          </div>
        </div>
      )}
    </div>
  );
}

function drawHexGrid(graphics: Graphics, width: number, height: number) {
  const hexSize = 20;
  const hexHeight = hexSize * 2;
  const hexWidth = Math.sqrt(3) * hexSize;
  const vertDist = hexHeight * 0.75;

  graphics.setStrokeStyle({ width: 0.5, color: 0xFFFFFF, alpha: 0.03 });

  for (let row = -1; row < height / vertDist + 1; row++) {
    for (let col = -1; col < width / hexWidth + 1; col++) {
      const x = col * hexWidth + (row % 2 === 0 ? 0 : hexWidth / 2);
      const y = row * vertDist;
      drawHexagon(graphics, x, y, hexSize);
    }
  }
}

function drawHexagon(graphics: Graphics, cx: number, cy: number, size: number) {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(cx + size * Math.cos(angle));
    points.push(cy + size * Math.sin(angle));
  }
  graphics.poly(points);
  graphics.stroke();
}

function drawZonePolygon(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: number,
  border: number,
  zoneIndex: number
) {
  // Deterministic irregular polygon based on zone index
  const inset = 3;
  const seed = zoneIndex * 1000;

  const jitter = (i: number) => seededRandom(seed + i) * 6;

  const points = [
    x + inset + jitter(0), y + inset,
    x + width - inset - jitter(1), y + inset + jitter(2),
    x + width - inset, y + height * 0.35 + jitter(3),
    x + width - inset - jitter(4), y + height * 0.65 + jitter(5),
    x + width - inset, y + height - inset - jitter(6),
    x + inset + jitter(7), y + height - inset,
    x + inset, y + height * 0.6 - jitter(8),
    x + inset + jitter(9), y + height * 0.35 + jitter(10),
  ];

  graphics.poly(points);
  graphics.fill({ color: fill, alpha: 0.4 });
  graphics.setStrokeStyle({ width: 1, color: border, alpha: 0.25 });
  graphics.stroke();
}

// Fallback for non-WebGL browsers
function FallbackMap({ agents, selectedAgentId, onAgentClick }: {
  agents: Agent[];
  selectedAgentId?: string | null;
  onAgentClick?: (agent: Agent) => void;
}) {
  const agentsByZone: Record<string, Agent[]> = {
    shallows: [],
    awakening: [],
    volcano: [],
  };
  agents.forEach((agent) => {
    if (agentsByZone[agent.zone]) {
      agentsByZone[agent.zone].push(agent);
    }
  });

  return (
    <div className="grid grid-cols-3 gap-1 h-full">
      {(["shallows", "awakening", "volcano"] as const).map((zone) => (
        <div key={zone} className={`relative p-2 border zone-${zone}`}>
          <div className="text-[9px] font-bold mb-1 opacity-60" style={{ color: `#${ZONE_COLORS[zone].border.toString(16).padStart(6, '0')}` }}>
            {ZONE_COLORS[zone].label}
          </div>
          <div className="text-[8px] text-text-dim mb-2">
            [{agentsByZone[zone].filter(a => a.status === "alive").length}]
          </div>
          <div className="flex flex-wrap gap-1">
            {agentsByZone[zone].slice(0, 30).map((agent) => (
              <button
                key={agent.id}
                onClick={() => onAgentClick?.(agent)}
                className={`rounded-full transition-all ${
                  agent.id === selectedAgentId ? 'ring-2 ring-white' : ''
                }`}
                style={{
                  width: Math.min(6 + (agent.level || 1) * 0.5, 12),
                  height: Math.min(6 + (agent.level || 1) * 0.5, 12),
                  background: agent.status === "alive" ? "#00FF88" : "#FF3B3B",
                  opacity: agent.status === "alive" ? 0.9 : 0.4,
                }}
                title={`${agent.name} (Lv.${agent.level || 1})`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
