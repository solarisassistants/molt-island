"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LeftSidebar, TabId } from "@/components/LeftSidebar";
import { RightSidebar } from "@/components/RightSidebar";
import { GameView } from "@/components/GameView";
import { HowItWorks } from "@/components/HowItWorks";
import { SkillMdViewer } from "@/components/SkillMdViewer";
import { AgentDetailsPanel } from "@/components/AgentDetailsPanel";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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

interface LeaderboardEntry {
  id: string;
  name: string;
  level: number;
  kills: number;
  deaths: number;
  score: number;
  status: string;
  zone: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("game");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  // Get leaderboard to find selected agent details
  const leaderboard = useQuery(api.game.getLeaderboard, { limit: 50 }) as
    | { leaderboard: LeaderboardEntry[] }
    | undefined;

  // Find selected agent from leaderboard
  const selectedAgent: Agent | null = selectedAgentId
    ? leaderboard?.leaderboard?.find((a) => a.id === selectedAgentId) as Agent | undefined ?? null
    : null;

  const handleAgentSelect = (agentId: string | null) => {
    setSelectedAgentId(agentId);
  };

  return (
    <div className="flex h-screen bg-background bg-grid overflow-hidden">
      {/* Mobile Menu Button */}
      <div className="fixed top-3 left-3 z-50 md:hidden">
        <Sheet open={leftDrawerOpen} onOpenChange={setLeftDrawerOpen}>
          <SheetTrigger asChild>
            <button className="w-10 h-10 bg-bg-panel border border-border flex items-center justify-center text-text-primary hover:bg-white/10">
              ☰
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-bg-panel border-r border-border">
            <LeftSidebar
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                setLeftDrawerOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Mobile Stats Button */}
      <div className="fixed top-3 right-3 z-50 md:hidden">
        <Sheet open={rightDrawerOpen} onOpenChange={setRightDrawerOpen}>
          <SheetTrigger asChild>
            <button className="w-10 h-10 bg-bg-panel border border-border flex items-center justify-center text-text-primary hover:bg-white/10">
              📊
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-0 bg-bg-panel border-l border-border">
            <RightSidebar />
          </SheetContent>
        </Sheet>
      </div>

      {/* Left Sidebar - Desktop */}
      <div className="hidden md:block">
        <LeftSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "game" && (
          <GameView
            selectedAgentId={selectedAgentId}
            onAgentSelect={handleAgentSelect}
          />
        )}
        {activeTab === "how" && <HowItWorks />}
        {activeTab === "skill" && <SkillMdViewer />}
      </main>

      {/* Right Sidebar - Desktop */}
      <div className="hidden md:block">
        <RightSidebar />
      </div>

      {/* Agent Details Panel - Desktop */}
      {selectedAgentId && selectedAgent && (
        <div className="hidden md:block">
          <AgentDetailsPanel
            agent={selectedAgent}
            onClose={() => setSelectedAgentId(null)}
          />
        </div>
      )}

      {/* Agent Details Panel - Mobile (Bottom Sheet) */}
      {selectedAgentId && selectedAgent && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40">
          <div className="bg-bg-panel border-t border-border p-4 animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 flex items-center justify-center border ${
                    selectedAgent.status === "alive"
                      ? "border-success bg-success/10"
                      : "border-red-500 bg-red-500/10"
                  }`}
                >
                  <span className="font-bold">{selectedAgent.name.charAt(0)}</span>
                </div>
                <div>
                  <div className="font-bold text-sm">{selectedAgent.name}</div>
                  <div className="text-[10px] text-text-dim">
                    Lv.{selectedAgent.level} · {selectedAgent.zone.toUpperCase()}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedAgentId(null)}
                className="text-text-dim hover:text-text-primary"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-black/30 p-2 border border-border">
                <div className="text-[8px] text-text-dim">HP</div>
                <div className="text-xs font-bold">
                  {selectedAgent.hp}/{selectedAgent.maxHp}
                </div>
              </div>
              <div className="bg-black/30 p-2 border border-border">
                <div className="text-[8px] text-text-dim">KILLS</div>
                <div className="text-xs font-bold">{selectedAgent.kills ?? 0}</div>
              </div>
              <div className="bg-black/30 p-2 border border-border">
                <div className="text-[8px] text-text-dim">DEATHS</div>
                <div className="text-xs font-bold">{selectedAgent.deaths ?? 0}</div>
              </div>
              <div className="bg-black/30 p-2 border border-border">
                <div className="text-[8px] text-text-dim">SCORE</div>
                <div className="text-xs font-bold text-accent">{selectedAgent.score ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
