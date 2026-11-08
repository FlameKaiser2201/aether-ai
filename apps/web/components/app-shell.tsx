"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  AudioLines,
  Brain,
  ChevronDown,
  History,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { AetherLogo } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { endSession } from "@/lib/auth-client";
import { NAV_ITEMS } from "@/lib/constants";
import { cn, initials } from "@/lib/utils";

const ICONS = {
  MessageSquare,
  AudioLines,
  Sparkles,
  History,
  Brain,
  Settings2,
} as const;

export interface ShellUser {
  name: string;
  email: string;
  image: string | null;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon];
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
              active
                ? "bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-slate-200",
            )}
          >
            {active ? (
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-cyan-300 to-violet-400" />
            ) : null}
            <Icon
              className={cn(
                "h-[18px] w-[18px] transition-colors",
                active
                  ? "text-cyan-300"
                  : "text-slate-500 group-hover:text-slate-300",
              )}
            />
            <span className="font-medium">{item.label}</span>
            {item.href === "/voice" ? (
              <Badge variant="secondary" className="ml-auto px-1.5 py-0 text-[9px]">
                LIVE
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const { data: session } = useSession();
  const name = session?.user?.name ?? user.name;
  const email = session?.user?.email ?? user.email;
  const image = session?.user?.image ?? user.image;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-left transition-colors hover:bg-white/[0.06]">
          <Avatar className="h-8 w-8">
            {image ? <AvatarImage src={image} alt={name} /> : null}
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-slate-200">
              {name}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {email}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings2 className="h-4 w-4" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/memory">
            <Brain className="h-4 w-4" /> Memory
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-rose-200 focus:bg-rose-500/10"
          onSelect={() => void endSession()}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({
  user,
  onNavigate,
}: {
  user: ShellUser;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <AetherLogo href="/chat" showTagline />
      </div>

      <div className="px-3 pb-4">
        <Button asChild variant="aurora" className="w-full justify-start">
          <Link href="/chat" onClick={onNavigate}>
            <Plus className="h-4 w-4" /> New conversation
          </Link>
        </Button>
      </div>

      <div className="px-5 pb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
        Workspace
      </div>
      <NavLinks onNavigate={onNavigate} />

      <div className="mt-auto space-y-3 p-3">
        <div className="rounded-xl border border-cyan-400/10 bg-gradient-to-br from-cyan-400/[0.06] to-violet-500/[0.06] p-3">
          <div className="flex items-center gap-2 text-[11px] font-medium text-cyan-200">
            <ShieldCheck className="h-3.5 w-3.5" /> Private by design
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Memory is editable, deletions are real, and every answer shows its
            routing and sources.
          </p>
        </div>
        <UserMenu user={user} />
      </div>
    </div>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-white/[0.06] bg-[#060912]/80 backdrop-blur-2xl lg:block">
        <SidebarContent user={user} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[280px] border-r border-white/10 bg-[#060912] shadow-2xl">
            <button
              className="absolute right-3 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-white"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent user={user} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/[0.06] bg-[#05060a]/75 px-4 backdrop-blur-2xl sm:px-6">
          <button
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <AetherLogo href="/chat" />
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-xs text-muted-foreground">Workspace</span>
            <span className="text-xs text-slate-600">/</span>
            <span className="text-xs font-medium text-slate-200">
              {current?.label ?? "AETHER"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className="hidden gap-1.5 border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-200 sm:inline-flex"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Encrypted session
            </Badge>
            <span className="hidden text-[11px] text-muted-foreground md:block">
              {new Date().toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </header>

        <main className="min-h-[calc(100dvh-4rem)]">{children}</main>
      </div>
    </div>
  );
}
