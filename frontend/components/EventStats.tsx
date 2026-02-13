"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Panel } from "./Panel";
import { Skeleton } from "./ui/skeleton";
import { formatUSDC } from "@/lib/utils";

interface EventStatsData {
  kills: number;
  deaths: number;
  levelUps: number;
  bountyPaid: number;
  totalEvents: number;
  zoneTransitions: number;
  bossKills: number;
}

// Mock activity data for the mini chart (would come from API in production)
const mockActivityData = [12, 8, 15, 22, 18, 25, 20];

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="mini-bar h-1 w-full mt-1 rounded-sm overflow-hidden">
      <div
        className="mini-bar-fill h-full rounded-sm"
        style={{ width: `${Math.min(100, percentage)}%`, background: color }}
      />
    </div>
  );
}

function MiniChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-0.5 h-6 mt-2">
      {data.map((value, i) => (
        <div
          key={i}
          className="flex-1 bg-text-secondary/20 rounded-t-sm transition-all"
          style={{
            height: `${(value / max) * 100}%`,
            minHeight: '2px',
            background: i === data.length - 1 ? 'var(--accent)' : 'rgba(255,255,255,0.15)'
          }}
        />
      ))}
    </div>
  );
}

export function EventStats() {
  const stats = useQuery(api.events.getStats, {}) as EventStatsData | undefined;

  if (stats === undefined) {
    return (
      <Panel title="STATS (1H)" statusText="LOAD...">
        <div className="grid grid-cols-2 gap-1.5 md:gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-1.5 md:p-2 border border-border">
              <Skeleton className="h-3 w-12 mb-1" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <Skeleton className="h-6 w-full" />
        </div>
      </Panel>
    );
  }

  const kills = stats?.kills || 0;
  const deaths = stats?.deaths || 0;
  const maxKD = Math.max(kills, deaths, 1);

  const statItems = [
    { label: "KILLS", value: kills, color: "var(--accent)", showBar: true, max: maxKD },
    { label: "DEATHS", value: deaths, color: "#FF3B3B", showBar: true, max: maxKD },
    { label: "LEVEL UPS", value: stats?.levelUps || 0, color: "var(--success)", showBar: false },
    { label: "BOUNTIES", value: `$${formatUSDC(stats?.bountyPaid || 0)}`, color: "var(--accent)", showBar: false },
  ];

  return (
    <Panel title="STATS (1H)" statusText="LIVE" active>
      <div className="grid grid-cols-2 gap-1.5 md:gap-2">
        {statItems.map((item) => (
          <div key={item.label} className="p-1.5 md:p-2 border border-border bg-black/20">
            <div className="text-[9px] md:text-[10px] text-text-dim uppercase tracking-wider">
              {item.label}
            </div>
            <div
              className="text-sm md:text-lg font-bold truncate terminal-glow"
              style={{ color: item.color }}
            >
              {item.value}
            </div>
            {item.showBar && typeof item.value === 'number' && (
              <MiniBar value={item.value} max={item.max || 1} color={item.color} />
            )}
          </div>
        ))}
      </div>

      {/* Mini activity chart */}
      <div className="mt-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] md:text-[9px] text-text-dim uppercase">7-TICK ACTIVITY</span>
          <span className="text-[8px] md:text-[9px] text-text-dim">{stats?.totalEvents || 0} TOTAL</span>
        </div>
        <MiniChart data={mockActivityData} />
      </div>
    </Panel>
  );
}
