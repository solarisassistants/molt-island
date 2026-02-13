"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Panel } from "./Panel";
import { ScrollArea } from "./ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Skeleton } from "./ui/skeleton";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  id: string;
  name: string;
  level: number;
  kills: number;
  score: number;
  status: string;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  season: {
    number: number;
    prizePool: number;
    endsAt: number;
  } | null;
}

// Placeholder rows for empty state
const placeholderRows = Array(5).fill(null).map((_, i) => ({
  id: `placeholder-${i}`,
  rank: String(i + 1).padStart(2, "0"),
}));

export function Leaderboard() {
  const response = useQuery(api.game.getLeaderboard, { limit: 15 }) as LeaderboardResponse | undefined;

  if (response === undefined) {
    return (
      <Panel title="LEADERBOARD" statusText="LOAD..." className="h-full">
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </Panel>
    );
  }

  const entries = response?.leaderboard || [];
  const hasEntries = entries.length > 0;

  return (
    <Panel title="LEADERBOARD" statusText={`${entries.length} AGENTS`} className="h-full">
      <ScrollArea className="h-[200px] md:h-[300px]">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border">
              <TableHead className="w-6 md:w-10 text-[9px] md:text-[10px] text-text-dim font-normal">##</TableHead>
              <TableHead className="text-[9px] md:text-[10px] text-text-dim font-normal">NAME</TableHead>
              <TableHead className="w-8 md:w-12 text-center text-[9px] md:text-[10px] text-text-dim font-normal">LVL</TableHead>
              <TableHead className="hidden sm:table-cell w-12 md:w-14 text-center text-[9px] md:text-[10px] text-text-dim font-normal">KILLS</TableHead>
              <TableHead className="w-12 md:w-16 text-right text-[9px] md:text-[10px] text-text-dim font-normal">SCORE</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hasEntries ? (
              entries.map((entry, index) => (
                <TableRow
                  key={entry.id}
                  className={cn(
                    "border-b border-border/50 transition-colors hover:bg-white/5",
                    index < 3 && "border-l-2 border-l-accent",
                    "table-row-alt"
                  )}
                >
                  <TableCell
                    className={cn(
                      "text-[10px] md:text-xs py-1.5",
                      index < 3 ? "text-accent terminal-glow-accent" : "text-text-dim"
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </TableCell>
                  <TableCell className="font-medium text-[10px] md:text-xs max-w-[80px] md:max-w-none truncate py-1.5">
                    <span
                      className={cn(
                        entry.status !== "alive" && "line-through text-text-dim"
                      )}
                    >
                      {entry.name}
                    </span>
                    {entry.status !== "alive" && (
                      <span className="ml-1 text-[8px] text-red-400">●</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-[10px] md:text-xs py-1.5 text-text-secondary">{entry.level}</TableCell>
                  <TableCell className="hidden sm:table-cell text-center text-[10px] md:text-xs py-1.5 text-text-secondary">{entry.kills}</TableCell>
                  <TableCell className="text-right text-[10px] md:text-xs py-1.5 text-text-primary font-mono">{entry.score}</TableCell>
                </TableRow>
              ))
            ) : (
              // Empty state with placeholder rows
              placeholderRows.map((placeholder) => (
                <TableRow
                  key={placeholder.id}
                  className="placeholder-row"
                >
                  <TableCell className="text-[10px] md:text-xs py-1.5 text-text-dim">
                    {placeholder.rank}
                  </TableCell>
                  <TableCell className="text-[10px] md:text-xs py-1.5 text-text-dim">
                    ---
                  </TableCell>
                  <TableCell className="text-center text-[10px] md:text-xs py-1.5 text-text-dim">
                    -
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-center text-[10px] md:text-xs py-1.5 text-text-dim">
                    -
                  </TableCell>
                  <TableCell className="text-right text-[10px] md:text-xs py-1.5 text-text-dim">
                    ---
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Footer status */}
      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[8px] md:text-[9px] text-text-dim">
        <span>RANK BY SCORE</span>
        <span>TOP 15</span>
      </div>
    </Panel>
  );
}
