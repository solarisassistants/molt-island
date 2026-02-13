"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "./ui/skeleton";
import { formatUSDC, formatCountdown } from "@/lib/utils";
import { useEffect, useState } from "react";

interface Season {
  _id: string;
  number: number;
  prizePool: number;
  startTime: number;
  endTime: number;
}

interface LeaderboardResponse {
  leaderboard: unknown[];
  season: unknown;
}

export function SeasonStats() {
  const season = useQuery(api.seasons.getActive) as Season | null | undefined;
  const leaderboard = useQuery(api.game.getLeaderboard, { limit: 100 }) as LeaderboardResponse | undefined;
  const [countdown, setCountdown] = useState("--:--:--");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!season?.endTime || !season?.startTime) return;

    const update = () => {
      setCountdown(formatCountdown(season.endTime));
      const total = season.endTime - season.startTime;
      const elapsed = Date.now() - season.startTime;
      setProgress(Math.min(100, Math.max(0, (elapsed / total) * 100)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [season?.endTime, season?.startTime]);

  if (season === undefined) {
    return (
      <div className="space-y-2">
        <div className="flex items-stretch gap-0 border border-border bg-panel">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-1 p-2 md:p-3 flex flex-col">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-5 md:h-6 w-16" />
            </div>
          ))}
        </div>
        <div className="progress-bar-track">
          <div className="progress-bar-fill h-full" style={{ width: '0%' }} />
        </div>
      </div>
    );
  }

  if (!season) {
    return (
      <div className="border border-accent bg-panel p-3 text-center">
        <span className="text-accent terminal-glow-accent">NO ACTIVE SEASON</span>
      </div>
    );
  }

  const agentCount = leaderboard?.leaderboard?.length || 0;

  const stats = [
    { label: "SEASON", value: `#${String(season.number).padStart(2, "0")}`, pulse: false },
    { label: "PRIZE POOL", value: `$${formatUSDC(season.prizePool)}`, pulse: false },
    { label: "AGENTS", value: agentCount.toString(), pulse: false },
    { label: "TIME LEFT", value: countdown, pulse: true },
  ];

  return (
    <div className="space-y-1">
      {/* Stats row with separators */}
      <div className="flex items-stretch border border-border bg-panel relative">
        {/* Corner brackets */}
        <span className="absolute -top-[1px] -left-[1px] text-[10px] text-text-secondary opacity-50">┌</span>
        <span className="absolute -top-[1px] -right-[1px] text-[10px] text-text-secondary opacity-50">┐</span>
        <span className="absolute -bottom-[1px] -left-[1px] text-[10px] text-text-secondary opacity-50">└</span>
        <span className="absolute -bottom-[1px] -right-[1px] text-[10px] text-text-secondary opacity-50">┘</span>

        {stats.map((stat, index) => (
          <div key={stat.label} className="flex items-stretch flex-1">
            <div className="flex-1 p-2 md:p-3 flex flex-col justify-center">
              <div className="text-[9px] md:text-[10px] text-text-dim uppercase tracking-wider mb-0.5">
                {stat.label}
              </div>
              <div
                className={`text-sm md:text-lg text-text-primary font-bold truncate ${
                  stat.pulse ? 'countdown-pulse terminal-glow' : ''
                }`}
              >
                {stat.value}
              </div>
            </div>
            {index < stats.length - 1 && (
              <div className="stat-separator" />
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="progress-bar-track">
        <div
          className="progress-bar-fill h-full"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
