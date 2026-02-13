"use client";

import { cn } from "@/lib/utils";

export type TabId = "game" | "how" | "skill";

interface LeftSidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  className?: string;
}

const tabs: { id: TabId; icon: string; label: string }[] = [
  { id: "game", icon: "◉", label: "GAME" },
  { id: "how", icon: "?", label: "HOW IT WORKS" },
  { id: "skill", icon: "◈", label: "SKILL.MD" },
];

export function LeftSidebar({ activeTab, onTabChange, className }: LeftSidebarProps) {
  return (
    <aside
      className={cn(
        "w-14 md:w-48 bg-bg-panel border-r border-border flex flex-col",
        className
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-center md:justify-start md:px-4 border-b border-border">
        <img src="/logo.svg" alt="Molt Island" className="w-8 h-8" />
        <span className="hidden md:block ml-2 text-xs font-bold tracking-wider text-text-primary">
          MOLT ISLAND
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
              "hover:bg-white/5",
              activeTab === tab.id
                ? "border-l-2 border-l-accent bg-accent/5 text-text-primary"
                : "border-l-2 border-l-transparent text-text-dim"
            )}
          >
            <span className="text-lg w-6 text-center">{tab.icon}</span>
            <span className="hidden md:block text-[10px] font-mono tracking-wider">
              {tab.label}
            </span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="hidden md:block text-[8px] text-text-dim font-mono">
          <div>SOLARIS AI</div>
          <div className="text-accent">v1.0.0</div>
        </div>
      </div>
    </aside>
  );
}
