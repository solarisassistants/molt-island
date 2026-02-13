"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Panel } from "./Panel";
import { Skeleton } from "./ui/skeleton";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

// Dynamic import to avoid SSR issues with PixiJS
const WorldMapCanvas = dynamic(
  () => import("./WorldMapCanvas").then((mod) => mod.WorldMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 md:h-64 flex items-center justify-center bg-black/20">
        <div className="text-text-dim text-xs font-mono">INITIALIZING TACTICAL VIEW...</div>
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
  npcs: unknown[];
}

export function WorldMap() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

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

  const agents = useMemo(() => {
    if (!worldState?.agents) return [];
    return worldState.agents.map((a) => ({
      id: a.id,
      name: a.name,
      zone: a.zone,
      status: a.status,
      level: a.level,
      position: a.position,
    }));
  }, [worldState?.agents]);

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return agents.find(a => a.id === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  const agentCounts = useMemo(() => {
    const counts = { shallows: 0, awakening: 0, volcano: 0, total: 0, alive: 0 };
    agents.forEach((a) => {
      if (a.zone in counts) {
        (counts[a.zone as keyof typeof counts] as number)++;
      }
      counts.total++;
      if (a.status === "alive") counts.alive++;
    });
    return counts;
  }, [agents]);

  const handleAgentClick = (agent: { id: string; name: string }) => {
    setSelectedAgentId(prev => prev === agent.id ? null : agent.id);
  };

  const handleZoneClick = (zone: string) => {
    setSelectedZone(prev => prev === zone ? null : zone);
  };

  if (season === undefined || (season && worldState === undefined)) {
    return (
      <Panel title="TACTICAL MAP" statusText="SYNC..." className="h-full">
        <div className="h-48 md:h-64 flex items-center justify-center">
          <Skeleton className="w-full h-full" />
        </div>
      </Panel>
    );
  }

  if (!season) {
    return (
      <Panel title="TACTICAL MAP" statusText="OFFLINE" className="h-full">
        <div className="h-48 md:h-64 flex items-center justify-center text-text-dim font-mono text-xs">
          NO ACTIVE SEASON
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="TACTICAL MAP"
      statusText={`${agentCounts.alive}/${agentCounts.total} ALIVE`}
      active
      className="h-full"
    >
      <div className="h-48 md:h-64 relative">
        <WorldMapCanvas
          agents={agents}
          onZoneClick={handleZoneClick}
          onAgentClick={handleAgentClick}
          selectedAgentId={selectedAgentId}
          worldBounds={season.config.worldBounds}
        />
      </div>

      {/* Selected agent info bar */}
      {selectedAgent && (
        <div className="mt-2 p-2 border border-accent/50 bg-accent/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: selectedAgent.status === "alive" ? "#00FF88" : "#FF3B3B" }}
            />
            <span className="text-[10px] md:text-xs font-bold text-text-primary">{selectedAgent.name}</span>
            <span className="text-[9px] md:text-[10px] text-text-dim">Lv.{selectedAgent.level}</span>
          </div>
          <div className="flex items-center gap-3 text-[9px] md:text-[10px] text-text-dim">
            <span>{selectedAgent.zone.toUpperCase()}</span>
            <span className={selectedAgent.status === "alive" ? "text-success" : "text-red-400"}>
              {selectedAgent.status.toUpperCase()}
            </span>
            <button
              onClick={() => setSelectedAgentId(null)}
              className="text-text-secondary hover:text-text-primary"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Legend and stats */}
      {!selectedAgent && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2 md:gap-3 text-[8px] md:text-[9px] text-text-dim">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success shadow-[0_0_3px_#00FF88]" />
              <span>ALIVE</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 opacity-50" />
              <span>DEAD</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_3px_#FFD700]" />
              <span>TOP 3</span>
            </div>
          </div>
          <div className="text-[7px] md:text-[8px] text-text-dim font-mono tracking-wider">
            S:{agentCounts.shallows} · A:{agentCounts.awakening} · V:{agentCounts.volcano}
          </div>
        </div>
      )}
    </Panel>
  );
}
