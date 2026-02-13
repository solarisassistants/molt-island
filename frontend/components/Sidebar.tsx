"use client";

import { cn } from "@/lib/utils";

interface NavItem {
  icon: string;
  label: string;
  active?: boolean;
}

const navItems: NavItem[] = [
  { icon: "\u25C9", label: "Dashboard", active: true },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-12 min-h-screen bg-panel border-r border-border flex-col items-center py-4 gap-1">
      {/* Logo */}
      <div className="w-8 h-8 border border-accent flex items-center justify-center mb-6">
        <span className="text-accent text-sm font-bold">M</span>
      </div>

      {/* Nav items */}
      {navItems.map((item) => (
        <button
          key={item.label}
          title={item.label}
          className={cn(
            "w-full h-10 flex items-center justify-center relative transition-colors",
            "hover:bg-text-secondary/5",
            item.active && "text-accent"
          )}
        >
          {item.active && (
            <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
          )}
          <span className="text-lg">{item.icon}</span>
        </button>
      ))}
    </aside>
  );
}
