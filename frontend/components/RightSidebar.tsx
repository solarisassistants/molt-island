"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface LeaderboardEntry {
  id: string;
  name: string;
  level: number;
  kills: number;
  score: number;
  status: string;
}

interface Event {
  id: string;
  type: string;
  timestamp: number;
  agentName?: string;
  targetName?: string;
  data: { message?: string };
}

export function RightSidebar({ className }: { className?: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const season = useQuery(api.seasons.getActive);
  const leaderboard = useQuery(api.game.getLeaderboard, { limit: 10 }) as
    | { leaderboard: LeaderboardEntry[]; season: { number: number; prizePool: number; endsAt: number } | null }
    | undefined;
  const eventsResponse = useQuery(api.events.getRecent, { limit: 10 }) as { events: Event[]; seasonId: string | null } | undefined;
  const events = eventsResponse?.events;

  // Countdown timer
  useEffect(() => {
    if (!season?.endTime) return;
    const update = () => {
      const diff = season.endTime - Date.now();
      if (diff <= 0) {
        setTimeLeft("ENDED");
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${days}d ${hours}h ${mins}m`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [season?.endTime]);

  const formatUSD = (lamports: number) => {
    return `$${(lamports / 1000000).toLocaleString()}`;
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const aliveCount = leaderboard?.leaderboard?.filter((a) => a.status === "alive").length ?? 0;
  const totalCount = leaderboard?.leaderboard?.length ?? 0;

  return (
    <aside
      className={cn(
        "w-72 bg-bg-panel border-l border-border flex flex-col overflow-hidden",
        className
      )}
    >
      {/* Season Info */}
      <div className="p-3 border-b border-border">
        <div className="text-[9px] text-text-dim font-mono mb-2">SEASON INFO</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-black/30 p-2 border border-border">
            <div className="text-[8px] text-text-dim">SEASON</div>
            <div className="text-sm font-bold text-accent">#{season?.number ?? "-"}</div>
          </div>
          <div className="bg-black/30 p-2 border border-border">
            <div className="text-[8px] text-text-dim">PRIZE POOL</div>
            <div className="text-sm font-bold text-success">
              {season?.prizePool ? formatUSD(season.prizePool) : "-"}
            </div>
          </div>
          <div className="bg-black/30 p-2 border border-border">
            <div className="text-[8px] text-text-dim">AGENTS</div>
            <div className="text-sm font-bold text-text-primary">
              {aliveCount}/{totalCount}
            </div>
          </div>
          <div className="bg-black/30 p-2 border border-border">
            <div className="text-[8px] text-text-dim">TIME LEFT</div>
            <div className="text-sm font-bold text-yellow-400">{timeLeft || "-"}</div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="flex-1 min-h-0 border-b border-border">
        <div className="p-3 pb-1">
          <div className="text-[9px] text-text-dim font-mono">LEADERBOARD</div>
        </div>
        <ScrollArea className="h-[180px]">
          <div className="px-3 pb-2">
            {leaderboard?.leaderboard?.map((entry, i) => (
              <div
                key={entry.id}
                className={cn(
                  "flex items-center gap-2 py-1.5 border-b border-border/30",
                  i < 3 && "text-accent"
                )}
              >
                <span className="w-5 text-[10px] text-text-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "flex-1 text-[10px] truncate",
                    entry.status !== "alive" && "line-through opacity-50"
                  )}
                >
                  {entry.name}
                </span>
                <span className="text-[9px] text-text-dim">L{entry.level}</span>
                <span className="w-12 text-right text-[10px] font-mono">{entry.score}</span>
              </div>
            ))}
            {(!leaderboard?.leaderboard || leaderboard.leaderboard.length === 0) && (
              <div className="text-[10px] text-text-dim text-center py-4">
                NO AGENTS YET
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Event Feed */}
      <div className="flex-1 min-h-0">
        <div className="p-3 pb-1 flex items-center justify-between">
          <div className="text-[9px] text-text-dim font-mono">LIVE FEED</div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[8px] text-success">LIVE</span>
          </div>
        </div>
        <ScrollArea className="h-[160px]">
          <div className="px-3 pb-2 space-y-1">
            {events?.map((event) => (
              <div key={event.id} className="text-[9px] font-mono">
                <span className="text-text-dim">[{formatTime(event.timestamp)}]</span>{" "}
                <span
                  className={cn(
                    event.type === "agent_killed" || event.type === "agent_died"
                      ? "text-accent"
                      : event.type === "level_up"
                        ? "text-success"
                        : event.type === "combat"
                          ? "text-yellow-400"
                          : "text-text-secondary"
                  )}
                >
                  {event.data.message || `${event.agentName || "?"} - ${event.type}`}
                </span>
              </div>
            ))}
            {(!events || events.length === 0) && (
              <div className="text-[9px] text-text-dim text-center py-4">
                AWAITING EVENTS...
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}
