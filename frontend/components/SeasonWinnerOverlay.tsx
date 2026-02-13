"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Winner {
  place: number;
  name: string;
  score: number;
  payout: number;
}

interface SeasonWinnerOverlayProps {
  seasonNumber: number;
  winners: Winner[];
  onDismiss: () => void;
}

export function SeasonWinnerOverlay({ seasonNumber, winners, onDismiss }: SeasonWinnerOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const stableDismiss = useCallback(onDismiss, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(stableDismiss, 20000);
    return () => clearTimeout(timer);
  }, [stableDismiss]);

  const formatPayout = (lamports: number) =>
    `$${(lamports / 1_000_000).toFixed(2)}`;

  const first = winners.find((w) => w.place === 1);
  const second = winners.find((w) => w.place === 2);
  const third = winners.find((w) => w.place === 3);

  return (
    <div
      className={cn(
        "absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0"
      )}
      onClick={onDismiss}
    >
      <div className="relative border border-accent bg-bg-panel p-6 md:p-8 max-w-lg w-full mx-4">
        {/* Corner brackets */}
        <span className="absolute -top-[1px] -left-[1px] text-accent text-xs bracket-pulse">&#9484;</span>
        <span className="absolute -top-[1px] -right-[1px] text-accent text-xs bracket-pulse">&#9488;</span>
        <span className="absolute -bottom-[1px] -left-[1px] text-accent text-xs bracket-pulse">&#9492;</span>
        <span className="absolute -bottom-[1px] -right-[1px] text-accent text-xs bracket-pulse">&#9496;</span>

        {/* Title */}
        <div className="text-center mb-6">
          <div className="text-accent text-xs tracking-[0.3em] mb-1 terminal-glow-accent">
            SEASON #{seasonNumber}
          </div>
          <div className="text-xl md:text-2xl font-bold tracking-wider terminal-glow">
            SEASON COMPLETE
          </div>
          <div className="text-text-dim text-[10px] mt-1">
            ══════════════════
          </div>
        </div>

        {/* Podium: 2nd | 1st | 3rd */}
        <div className="flex items-end justify-center gap-2 mb-6">
          {second && (
            <div className="flex-1 max-w-[120px]">
              <div
                className="bg-black/40 border border-border p-3 text-center"
                style={{ minHeight: "100px" }}
              >
                <div className="text-gray-300 text-[10px] font-bold">2ND</div>
                <div className="text-sm font-bold truncate mt-1">{second.name}</div>
                <div className="text-text-secondary text-xs font-mono mt-1">
                  {second.score.toLocaleString()}
                </div>
                <div className="text-success text-[10px] mt-1">
                  {formatPayout(second.payout)}
                </div>
              </div>
            </div>
          )}

          {first && (
            <div className="flex-1 max-w-[140px]">
              <div
                className="bg-black/40 border-2 border-yellow-400/50 p-3 text-center"
                style={{ minHeight: "130px" }}
              >
                <div className="text-yellow-400 text-xs font-bold terminal-glow">1ST</div>
                <div className="text-lg font-bold truncate mt-1 text-yellow-400">
                  {first.name}
                </div>
                <div className="text-text-primary text-sm font-mono mt-1 font-bold">
                  {first.score.toLocaleString()}
                </div>
                <div className="text-success text-xs mt-1 terminal-glow-green">
                  {formatPayout(first.payout)}
                </div>
              </div>
            </div>
          )}

          {third && (
            <div className="flex-1 max-w-[120px]">
              <div
                className="bg-black/40 border border-border p-3 text-center"
                style={{ minHeight: "80px" }}
              >
                <div className="text-amber-600 text-[10px] font-bold">3RD</div>
                <div className="text-sm font-bold truncate mt-1">{third.name}</div>
                <div className="text-text-secondary text-xs font-mono mt-1">
                  {third.score.toLocaleString()}
                </div>
                <div className="text-success text-[10px] mt-1">
                  {formatPayout(third.payout)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dismiss hint */}
        <div className="text-center">
          <span className="text-text-dim text-[10px] tracking-wider animate-pulse">
            [ CLICK TO CONTINUE ]
          </span>
        </div>
      </div>
    </div>
  );
}
