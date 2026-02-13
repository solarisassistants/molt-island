"use client";

import { useState } from "react";
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

      {/* Contract Address */}
      <ContractAddress />
    </aside>
  );
}

const CONTRACT = "8EZqVPJdEWt754S17nghfa4Y4jQJ7tigBwsGbo1Tpump";

function ContractAddress() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CONTRACT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={handleCopy}
      className="group relative cursor-pointer border-t border-border p-3 transition-all hover:bg-accent/5"
    >
      <div className="hidden md:block">
        <div className="text-[7px] text-text-dim uppercase tracking-[0.3em] font-bold mb-1">
          Contract Address
        </div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-accent text-[10px] font-bold tracking-tight">$SOLARIS</span>
        </div>
        <div className="flex items-center gap-2 bg-black/40 px-2 py-1.5 border border-border group-hover:border-accent/20 transition-colors">
          <p className="text-[7px] font-mono text-text-dim group-hover:text-text-primary transition-colors break-all leading-relaxed flex-1">
            {CONTRACT}
          </p>
          <span className="text-[8px] text-text-dim group-hover:text-accent transition-colors shrink-0">
            {copied ? "✓" : "⧉"}
          </span>
        </div>
      </div>
      <div className="md:hidden flex items-center justify-center">
        <span className="text-accent text-[9px] font-bold">$</span>
      </div>
    </div>
  );
}
