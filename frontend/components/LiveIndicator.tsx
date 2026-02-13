import { cn } from "@/lib/utils";

interface LiveIndicatorProps {
  className?: string;
}

export function LiveIndicator({ className }: LiveIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-1.5 md:gap-2", className)}>
      <span className="live-dot inline-block w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-success" />
      <span className="text-[10px] md:text-xs uppercase tracking-wider text-success">
        LIVE
      </span>
    </div>
  );
}
