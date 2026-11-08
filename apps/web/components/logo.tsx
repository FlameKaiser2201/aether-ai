import Link from "next/link";

import { cn } from "@/lib/utils";

export function AetherMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-cyan-300 via-sky-500 to-violet-600 shadow-[0_0_28px_-6px_rgba(34,211,238,0.8)]",
        className,
      )}
      aria-hidden="true"
    >
      <span className="absolute inset-[1px] rounded-[11px] bg-slate-950/25" />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="relative h-5 w-5 text-white"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2.8 20.2 7.4v9.2L12 21.2 3.8 16.6V7.4L12 2.8Z" opacity="0.9" />
        <path d="M12 7.2 16.4 9.7v4.6L12 16.8l-4.4-2.5V9.7L12 7.2Z" opacity="0.75" />
        <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function AetherLogo({
  href = "/",
  className,
  showTagline = false,
}: {
  href?: string;
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center gap-2.5", className)}
      aria-label="AETHER home"
    >
      <AetherMark className="transition-transform duration-300 group-hover:scale-105" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.05rem] font-semibold tracking-[0.24em] text-white">
          AETHER
        </span>
        {showTagline ? (
          <span className="mt-1 text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            Your mind, amplified
          </span>
        ) : null}
      </span>
    </Link>
  );
}
