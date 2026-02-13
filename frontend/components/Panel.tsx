import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PanelProps {
  title?: string;
  children: ReactNode;
  accent?: boolean;
  active?: boolean;
  className?: string;
  statusText?: string;
}

export function Panel({ title, children, accent, active, className, statusText }: PanelProps) {
  return (
    <div
      className={cn(
        "relative bg-panel border",
        accent ? "border-accent" : "border-border-bright",
        className
      )}
      style={{ borderColor: accent ? 'var(--accent)' : 'rgba(255,255,255,0.08)' }}
    >
      {/* Corner brackets - enhanced visibility */}
      <span
        className={cn(
          "absolute -top-[1px] -left-[1px] text-[10px] md:text-xs leading-none",
          accent ? "text-accent" : "text-text-secondary",
          active && "bracket-pulse"
        )}
        style={{ opacity: accent ? 1 : 0.5 }}
      >
        ┌
      </span>
      <span
        className={cn(
          "absolute -top-[1px] -right-[1px] text-[10px] md:text-xs leading-none",
          accent ? "text-accent" : "text-text-secondary",
          active && "bracket-pulse"
        )}
        style={{ opacity: accent ? 1 : 0.5 }}
      >
        ┐
      </span>
      <span
        className={cn(
          "absolute -bottom-[1px] -left-[1px] text-[10px] md:text-xs leading-none",
          accent ? "text-accent" : "text-text-secondary",
          active && "bracket-pulse"
        )}
        style={{ opacity: accent ? 1 : 0.5 }}
      >
        └
      </span>
      <span
        className={cn(
          "absolute -bottom-[1px] -right-[1px] text-[10px] md:text-xs leading-none",
          accent ? "text-accent" : "text-text-secondary",
          active && "bracket-pulse"
        )}
        style={{ opacity: accent ? 1 : 0.5 }}
      >
        ┘
      </span>

      {title && (
        <div className="px-2 py-1.5 md:px-3 md:py-2 border-b border-border flex items-center justify-between">
          <span className="text-[10px] md:text-xs uppercase tracking-wider text-text-secondary">
            {title}
          </span>
          {statusText && (
            <span className="text-[8px] md:text-[10px] uppercase tracking-wider text-text-dim font-mono">
              {statusText}
            </span>
          )}
        </div>
      )}
      <div className="p-2 md:p-3">{children}</div>
    </div>
  );
}
