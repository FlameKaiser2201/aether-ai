import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div
        className={cn("h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all", barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
