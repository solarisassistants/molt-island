"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Panel } from "./Panel";
import { ScrollArea } from "./ui/scroll-area";
import { Skeleton } from "./ui/skeleton";
import { cn, formatTime } from "@/lib/utils";

interface GameEvent {
  id: string;
  type: string;
  timestamp: number;
  agentName?: string;
  targetName?: string;
  data?: {
    message?: string;
    amount?: number;
  };
}

interface EventsResponse {
  events: GameEvent[];
  seasonId: string | null;
}

const eventColors: Record<string, string> = {
  agent_killed: "text-accent",
  agent_died: "text-accent",
  level_up: "text-success",
  zone_transition: "text-cyan-400",
  bounty_paid: "text-accent",
  agent_joined: "text-cyan-400",
  agent_respawned: "text-success",
  combat: "text-yellow-400",
  season_started: "text-success",
  season_ended: "text-accent",
};

function formatEventMessage(event: GameEvent): string {
  if (event.data?.message) return event.data.message;

  switch (event.type) {
    case "agent_killed":
    case "agent_died":
      return `${event.agentName || "Agent"} was eliminated`;
    case "level_up":
      return `${event.agentName || "Agent"} leveled up`;
    case "zone_transition":
      return `${event.agentName || "Agent"} moved zones`;
    case "bounty_paid":
      return `Bounty paid to ${event.agentName || "Agent"}`;
    case "agent_joined":
      return `${event.agentName || "Agent"} joined`;
    case "agent_respawned":
      return `${event.agentName || "Agent"} respawned`;
    case "combat":
      return `Combat occurred`;
    case "season_started":
      return "Season started";
    case "season_ended":
      return "Season ended";
    default:
      return event.type.replace(/_/g, " ");
  }
}

// Mock events for empty state to show terminal feel
const mockEvents: GameEvent[] = [
  { id: "mock1", type: "system", timestamp: Date.now() - 5000, data: { message: "System initialized" } },
  { id: "mock2", type: "system", timestamp: Date.now() - 4000, data: { message: "Connecting to game state..." } },
  { id: "mock3", type: "system", timestamp: Date.now() - 3000, data: { message: "Monitoring active" } },
];

export function EventFeed() {
  const response = useQuery(api.events.getRecent, { limit: 50 }) as EventsResponse | undefined;

  if (response === undefined) {
    return (
      <Panel title="LIVE FEED" accent statusText="SYNC...">
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  const eventList = response?.events?.length > 0 ? response.events : mockEvents;
  const isRealData = response?.events?.length > 0;

  return (
    <Panel title="LIVE FEED" accent active statusText={isRealData ? "LIVE" : "IDLE"}>
      <ScrollArea className="h-[150px] md:h-[200px]">
        <div className="feed-fade-top space-y-0.5 font-mono text-[10px] md:text-xs">
          {/* Fake older entries to suggest scroll history */}
          <div className="text-text-dim text-[9px] mb-1 opacity-50">
            ··· earlier events ···
          </div>

          {eventList.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-1 md:gap-2 py-0.5 hover:bg-white/5 px-1 -mx-1 rounded"
            >
              <span className="text-text-dim text-[9px] md:text-[10px] shrink-0 font-mono">
                [{formatTime(event.timestamp)}]
              </span>
              <span className="text-text-dim">›</span>
              <span
                className={cn(
                  "break-words terminal-glow",
                  eventColors[event.type] || "text-text-secondary"
                )}
              >
                {formatEventMessage(event)}
              </span>
            </div>
          ))}

          {/* Cursor blink effect */}
          <div className="flex items-center gap-1 mt-1 text-text-dim">
            <span className="text-[9px] md:text-[10px]">[{formatTime(Date.now())}]</span>
            <span>›</span>
            <span className="animate-pulse">_</span>
          </div>
        </div>
      </ScrollArea>
    </Panel>
  );
}
