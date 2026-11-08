import Link from "next/link";
import {
  ArrowLeft,
  AudioLines,
  Brain,
  CheckCircle2,
  Globe2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AetherLogo } from "@/components/logo";

const POINTS = [
  { icon: AudioLines, text: "Talk naturally with continuous voice" },
  { icon: Brain, text: "Memory you can inspect and erase" },
  { icon: Globe2, text: "Research with real, numbered citations" },
  { icon: ShieldCheck, text: "Keys stay server-side. Always." },
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-aurora-radial opacity-60" />
      <div className="grid-backdrop pointer-events-none absolute inset-0" />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden border-r border-white/[0.06] p-10 lg:flex xl:p-14">
          <div className="absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />

          <div className="relative flex items-center justify-between">
            <AetherLogo showTagline />
            <Link
              href="/"
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back home
            </Link>
          </div>

          <div className="relative max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
              <Sparkles className="h-3 w-3" /> Your mind, amplified
            </span>
            <h2 className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-[-0.02em] text-white xl:text-5xl">
              One workspace.
              <br />
              <span className="text-gradient">Every context.</span>
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-400">
              Study, code, interview, research and remember — without
              re-explaining yourself every time.
            </p>

            <ul className="mt-8 space-y-3">
              {POINTS.map((point) => (
                <li
                  key={point.text}
                  className="flex items-center gap-3 text-[13px] text-slate-300"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-200">
                    <point.icon className="h-4 w-4" />
                  </span>
                  {point.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-xl">
            <p className="text-[13px] leading-6 text-slate-300">
              “AETHER is designed to be honest: it shows which model answered,
              which sources it used, and what it cannot do.”
            </p>
            <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
              Open source · self-hostable
            </div>
          </div>
        </section>

        <section className="flex min-h-screen flex-col">
          <div className="flex items-center justify-between p-5 lg:hidden">
            <AetherLogo />
            <Link
              href="/"
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Link>
          </div>

          <div className="flex flex-1 items-center justify-center px-5 pb-10 pt-4 sm:px-8">
            <div className="w-full max-w-[400px] animate-fade-up">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-white">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {subtitle}
              </p>
              <div className="mt-8">{children}</div>
              <div className="mt-6 text-center text-xs text-muted-foreground">
                {footer}
              </div>
            </div>
          </div>

          <div className="px-5 pb-6 text-center text-[10px] text-slate-600">
            Protected by rate limiting, input validation and encrypted sessions.
          </div>
        </section>
      </div>
    </div>
  );
}
