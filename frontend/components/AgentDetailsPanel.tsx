"use client";

import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  zone: string;
  status: string;
  kills?: number;
  deaths?: number;
  score?: number;
  position?: { x: number; y: number };
}

interface AgentDetailsPanelProps {
  agent: Agent | null;
  onClose: () => void;
  className?: string;
}

export function AgentDetailsPanel({ agent, onClose, className }: AgentDetailsPanelProps) {
  if (!agent) return null;

  const hpPercent = Math.round((agent.hp / agent.maxHp) * 100);
  const hpColor =
    hpPercent > 60 ? "bg-success" : hpPercent > 30 ? "bg-yellow-400" : "bg-red-500";

  return (
    <aside
      className={cn(
        "w-64 bg-bg-panel border-l border-border flex flex-col",
        "animate-in slide-in-from-right duration-200",
        className
      )}
    >
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="text-[9px] text-text-dim font-mono">AGENT DETAILS</div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-text-primary hover:bg-white/10 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Agent Info */}
      <div className="p-4 space-y-4">
        {/* Name and Status */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 flex items-center justify-center border-2",
              agent.status === "alive"
                ? "border-success bg-success/10"
                : "border-red-500 bg-red-500/10"
            )}
            style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
          >
            <span className="text-lg font-bold">
              {agent.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="text-sm font-bold text-text-primary">{agent.name}</div>
            <div className="text-[10px] text-text-dim">
              Level {agent.level} ·{" "}
              <span
                className={cn(
                  agent.status === "alive" ? "text-success" : "text-red-400"
                )}
              >
                {agent.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* HP Bar */}
        <div>
          <div className="flex items-center justify-between text-[9px] text-text-dim mb-1">
            <span>HP</span>
            <span>
              {agent.hp}/{agent.maxHp}
            </span>
          </div>
          <div className="h-2 bg-black/50 border border-border overflow-hidden">
            <div
              className={cn("h-full transition-all", hpColor)}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <StatBox label="ZONE" value={agent.zone.toUpperCase()} />
          <StatBox label="LEVEL" value={agent.level.toString()} />
          {agent.kills !== undefined && (
            <StatBox label="KILLS" value={agent.kills.toString()} />
          )}
          {agent.deaths !== undefined && (
            <StatBox label="DEATHS" value={agent.deaths.toString()} />
          )}
          {agent.score !== undefined && (
            <StatBox label="SCORE" value={agent.score.toString()} highlight />
          )}
          {agent.position && (
            <StatBox
              label="POSITION"
              value={`${Math.round(agent.position.x)},${Math.round(agent.position.y)}`}
            />
          )}
        </div>
      </div>

      {/* Footer Note */}
      <div className="mt-auto p-3 border-t border-border">
        <div className="text-[8px] text-text-dim font-mono text-center">
          OBSERVER MODE · PUBLIC STATS ONLY
        </div>
      </div>
    </aside>
  );
}

function StatBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-black/30 p-2 border border-border">
      <div className="text-[8px] text-text-dim">{label}</div>
      <div
        className={cn(
          "text-sm font-bold",
          highlight ? "text-accent" : "text-text-primary"
        )}
      >
        {value}
      </div>
    </div>
  );
}
