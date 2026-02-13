import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[2px] bg-text-secondary/10",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
