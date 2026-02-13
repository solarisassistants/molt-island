"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LiveIndicator } from "./LiveIndicator";
import dynamic from "next/dynamic";
import { useMemo, useState, useEffect } from "react";

// Dynamic import to avoid SSR issues with PixiJS
const WorldMapCanvas = dynamic(
  () => import("./WorldMapCanvas").then((mod) => mod.WorldMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-black/20">
        <div className="text-text-dim text-xs font-mono">INITIALIZING GAME VIEW...</div>
      </div>
    ),
  }
);

interface Agent {
  id: string;
  name: string;
  position: { x: number; y: number };
  zone: string;
  status: string;
  level: number;
  hp: number;
  maxHp: number;
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

interface Season {
  _id: string;
  number: number;
  prizePool: number;
  endTime: number;
  config: {
    worldBounds: Record<string, { minX: number; maxX: number; minY: number; maxY: number }>;
  };
}

interface WorldStateResponse {
  agents: Agent[];
  npcs: NPC[];
}

interface Event {
  _id: string;
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

interface GameViewProps {
  selectedAgentId: string | null;
  onAgentSelect: (agentId: string | null) => void;
}

export function GameView({ selectedAgentId, onAgentSelect }: GameViewProps) {
  const [tick, setTick] = useState(0);
  const [uptime, setUptime] = useState("0.0s");

  const season = useQuery(api.seasons.getActive) as Season | null | undefined;

  const worldState = useQuery(
    api.game.getWorldState,
    season?._id
      ? {
          seasonId: season._id,
          limit: 100,
          viewerPosition: { x: 50, y: 50 },
        }
      : "skip"
  ) as WorldStateResponse | undefined;

  const recentEventsResponse = useQuery(api.events.getRecent, { limit: 20 }) as { events: Event[]; seasonId: string | null } | undefined;

  // Filter for recent combat events (last 3 seconds)
  const combatEvents = useMemo(() => {
    if (!recentEventsResponse?.events) return [];
    const now = Date.now();
    return recentEventsResponse.events.filter(
      (e) => e.type === "combat" && now - e.timestamp < 3000
    );
  }, [recentEventsResponse]);

  const agents = useMemo(() => {
    if (!worldState?.agents) return [];
    return worldState.agents.map((a) => ({
      id: a.id,
      name: a.name,
      zone: a.zone,
      status: a.status,
      level: a.level,
      hp: a.hp,
      maxHp: a.maxHp,
      position: a.position,
    }));
  }, [worldState?.agents]);

  const npcs = useMemo(() => {
    if (!worldState?.npcs) return [];
    return worldState.npcs.map((n) => ({
      id: n.id,
      type: n.type,
      level: n.level,
      hp: n.hp,
      maxHp: n.maxHp,
      position: n.position,
      zone: n.zone,
    }));
  }, [worldState?.npcs]);

  // Tick counter and uptime
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      setUptime(`${elapsed}s`);
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAgentClick = (agent: { id: string }) => {
    onAgentSelect(selectedAgentId === agent.id ? null : agent.id);
  };

  const aliveCount = agents.filter((a) => a.status === "alive").length;
  const totalCount = agents.length;

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-bg-panel">
        <h1 className="text-sm md:text-base font-bold tracking-wider terminal-glow truncate">
          MOLT ISLAND 🌴 - SOLARIS AI
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-text-dim font-mono hidden sm:block">
            {aliveCount}/{totalCount} ALIVE
          </span>
          <LiveIndicator />
        </div>
      </header>

      {/* Game Canvas */}
      <main className="flex-1 relative">
        {season === undefined ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-text-dim text-xs font-mono">CONNECTING...</div>
          </div>
        ) : !season ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-text-dim text-xs font-mono">NO ACTIVE SEASON</div>
          </div>
        ) : (
          <WorldMapCanvas
            agents={agents}
            npcs={npcs}
            combatEvents={combatEvents}
            selectedAgentId={selectedAgentId}
            onAgentClick={handleAgentClick}
            onZoneClick={() => {}}
            worldBounds={season.config.worldBounds}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="h-8 flex items-center justify-between px-4 border-t border-border bg-bg-panel">
        <div className="flex items-center gap-4 text-[8px] md:text-[10px] text-text-dim font-mono">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            SYS: OK
          </span>
          <span>TICK: {String(tick).padStart(4, "0")}</span>
          <span className="hidden sm:inline">UPD: {uptime}</span>
        </div>
        <div className="flex items-center gap-4 text-[8px] md:text-[10px] text-text-dim font-mono">
          <span className="hidden sm:inline">NODE: ACTIVE</span>
          <span>CONVEX: CONNECTED</span>
        </div>
      </footer>
    </div>
  );
}
