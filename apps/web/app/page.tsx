import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  Brain,
  Braces,
  CheckCircle2,
  FileText,
  Github,
  Globe2,
  Layers,
  Mic,
  Route,
  ShieldCheck,
  Sparkles,
  Waves,
  Zap,
} from "lucide-react";

import { AetherLogo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: AudioLines,
    title: "A voice that keeps up",
    body: "Streaming speech-to-text, sentence-level text-to-speech, continuous listening and barge-in. Talk naturally, interrupt any time.",
    accent: "from-cyan-400/20 to-sky-500/5",
  },
  {
    icon: BookOpen,
    title: "Study studio",
    body: "Turn any topic or document into structured notes, summaries, question banks, interactive quizzes, flashcards and day-by-day revision plans.",
    accent: "from-emerald-400/20 to-teal-500/5",
  },
  {
    icon: Braces,
    title: "Coding copilot",
    body: "Generate, debug, refactor, explain and review code across 15 languages and the frameworks teams actually ship with — with mechanical validation.",
    accent: "from-violet-400/20 to-fuchsia-500/5",
  },
  {
    icon: Mic,
    title: "Interview lab",
    body: "HR, technical, DSA, system design and company-specific mock interviews. Every answer is scored against a rubric with a stronger model answer.",
    accent: "from-amber-400/20 to-orange-500/5",
  },
  {
    icon: Globe2,
    title: "Research with receipts",
    body: "Live web search, page reading and numbered citations. AETHER shows where each material claim came from — or says it could not verify it.",
    accent: "from-sky-400/20 to-blue-500/5",
  },
  {
    icon: Brain,
    title: "Memory you control",
    body: "Short-term context, rolling summaries and durable long-term facts. Every memory is visible, editable and permanently deletable.",
    accent: "from-rose-400/20 to-pink-500/5",
  },
];

const MODES = [
  {
    name: "Auto",
    icon: Route,
    body: "AETHER classifies the task, then routes to a fast, balanced or reasoning model.",
  },
  {
    name: "Study",
    icon: BookOpen,
    body: "Socratic teaching, active recall, exam-focused artifacts and spaced revision.",
  },
  {
    name: "Code",
    icon: Braces,
    body: "Correctness, security, edge cases, complexity and a repair pass when validation fails.",
  },
  {
    name: "Interview",
    icon: Mic,
    body: "Structured mock rounds with hints, rubric scoring and a final improvement report.",
  },
  {
    name: "Research",
    icon: Globe2,
    body: "Search, read, compare sources and cite. No invented links, ever.",
  },
  {
    name: "Voice",
    icon: Waves,
    body: "Short, spoken-style answers designed for hands-free conversation.",
  },
];

const SECURITY = [
  {
    icon: ShieldCheck,
    title: "Defense in depth",
    body: "Auth.js sessions, rotating backend refresh tokens, strict input validation, output sanitization and rate limiting at every layer.",
  },
  {
    icon: Layers,
    title: "Private by default",
    body: "API keys stay server-side. Files are scoped per user. Supabase Storage or a local volume — your deployment, your data.",
  },
  {
    icon: FileText,
    title: "Reads real documents",
    body: "PDF, DOCX, TXT, CSV, JSON, Excel and images. Extract, analyze and summarize with evidence from the source.",
  },
  {
    icon: Zap,
    title: "Honest by design",
    body: "When a request needs a phone call, payment or physical action, AETHER says it cannot do that instead of pretending.",
  },
];

function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -left-8 top-12 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="absolute -right-6 bottom-8 h-44 w-44 rounded-full bg-violet-500/20 blur-3xl" />

      <div className="aurora-border relative rounded-[26px] p-px shadow-glass">
        <div className="overflow-hidden rounded-[25px] bg-[#070b14]/95">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <span className="h-2 w-2 rounded-full bg-rose-400/70" />
            <span className="h-2 w-2 rounded-full bg-amber-300/70" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
            <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              AETHER · live session
            </span>
            <Badge variant="success" className="ml-auto px-2 py-0 text-[9px]">
              VOICE
            </Badge>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex justify-end">
              <div className="max-w-[82%] rounded-2xl rounded-br-md border border-cyan-400/15 bg-cyan-400/[0.08] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-200">
                Explain database indexes like I&apos;m preparing for a backend
                interview.
              </div>
            </div>

            <div className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-300 to-violet-500 text-[10px] font-bold text-slate-950">
                AE
              </div>
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-white/[0.07] bg-white/[0.03] p-3.5">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="px-2 py-0 text-[9px]">
                    reasoning
                  </Badge>
                  <Badge variant="outline" className="px-2 py-0 text-[9px]">
                    quality route
                  </Badge>
                  <span className="text-[9px] text-slate-500">2 sources</span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-slate-300">
                  Think of an index as a sorted lookup structure. Without one,
                  PostgreSQL scans every row — <span className="text-cyan-200">O(n)</span>.
                  A B-tree index narrows the search to{" "}
                  <span className="text-cyan-200">O(log n)</span>…
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex items-center gap-[3px]">
                    {[3, 7, 4, 9, 5, 8, 3, 6, 9, 4, 7, 3].map((height, index) => (
                      <span
                        key={index}
                        className="w-[2px] rounded-full bg-cyan-300/70"
                        style={{
                          height: `${height * 2.2}px`,
                          animation: `float ${2 + (index % 4) * 0.4}s ease-in-out infinite`,
                          animationDelay: `${index * 80}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[9px] text-slate-500">
                    speaking · 0:12
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-white/[0.06] px-4 py-3">
            <div className="flex h-9 flex-1 items-center rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 text-[11px] text-slate-500">
              Ask anything, or hold the mic…
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-950">
              <Mic className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>

      <div className="absolute -left-4 top-1/3 hidden animate-float rounded-xl border border-white/10 bg-[#0b1020]/90 px-3 py-2 shadow-glass backdrop-blur-xl sm:block">
        <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">
          Router
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-cyan-200">
          coding → deepseek-coder
        </p>
      </div>
      <div
        className="absolute -right-5 bottom-24 hidden animate-float rounded-xl border border-white/10 bg-[#0b1020]/90 px-3 py-2 shadow-glass backdrop-blur-xl sm:block"
        style={{ animationDelay: "1.2s" }}
      >
        <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">
          Memory
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-violet-200">
          preparing for backend interviews
        </p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px] bg-aurora-radial opacity-70" />
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[900px]" />

      <header className="relative z-20 border-b border-white/[0.06]">
        <div className="container flex h-16 items-center justify-between">
          <AetherLogo showTagline />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-white">
              Features
            </a>
            <a href="#modes" className="transition-colors hover:text-white">
              Modes
            </a>
            <a href="#security" className="transition-colors hover:text-white">
              Security
            </a>
            <a
              href="https://github.com/FlameKaiser2201/aether-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-white"
            >
              <Github className="h-4 w-4" /> GitHub
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild variant="aurora" size="sm">
              <Link href="/register">
                Get started <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative z-10">
        <div className="container grid items-center gap-14 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-24">
          <div className="animate-fade-up">
            <Badge className="gap-2 border-cyan-400/20 bg-cyan-400/[0.08] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-200">
              <Sparkles className="h-3 w-3" /> Voice-first · Honest by design
            </Badge>
            <h1 className="mt-6 max-w-2xl font-display text-5xl font-semibold leading-[1.04] tracking-[-0.03em] text-balance sm:text-6xl lg:text-[4.4rem]">
              Your mind,
              <br />
              <span className="text-gradient">amplified.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
              AETHER is one workspace for study, code, interviews, research,
              documents and memory. Talk or type — it routes to the right model,
              remembers what matters, and shows its work.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="aurora" size="lg">
                <Link href="/register">
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/login">
                  <AudioLines className="h-4 w-4" /> Open the workspace
                </Link>
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
                Live models, selected automatically
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
                Bring your own models
              </span>
            </div>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
            <HeroPreview />
          </div>
        </div>

        <div className="border-y border-white/[0.06] bg-white/[0.015]">
          <div className="container grid grid-cols-2 divide-x divide-white/[0.06] py-6 md:grid-cols-4">
            {[
              ["15+", "code languages"],
              ["6", "assistant modes"],
              ["8", "memory categories"],
              ["100%", "memory control"],
            ].map(([value, label]) => (
              <div key={label} className="px-4 text-center first:pl-0 last:pr-0">
                <p className="font-display text-2xl font-semibold text-white">
                  {value}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 py-20 lg:py-28">
        <div className="container">
          <div className="max-w-2xl">
            <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80">
              One assistant, every context
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Built for the way you actually think.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">
              Most assistants do one thing well. AETHER connects study, code,
              interviews, research and documents through a shared memory — so
              context never has to start from zero.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.13] hover:bg-white/[0.04]"
              >
                <div
                  className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${feature.accent} blur-2xl transition-opacity duration-300 group-hover:opacity-100`}
                />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-cyan-200">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="relative mt-4 font-display text-base font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="relative mt-2 text-[13px] leading-6 text-slate-400">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="modes" className="relative z-10 border-y border-white/[0.06] bg-[#070a12]/50 py-20 lg:py-28">
        <div className="container">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300/80">
                Choose a mode — or let AETHER choose
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                The right model for the task.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-7 text-slate-400">
              Simple questions go to a fast model. Code goes to a coding model.
              Deep reasoning gets the strongest model available. You can pin a
              mode or strategy at any time.
            </p>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODES.map((mode) => (
              <div
                key={mode.name}
                className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/15 to-violet-500/15 text-cyan-200">
                  <mode.icon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">
                    {mode.name}
                  </h3>
                  <p className="mt-1 text-[12px] leading-5 text-slate-400">
                    {mode.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-20 lg:py-28">
        <div className="container grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/80">
              From question to outcome
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              A loop that compounds.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-400">
              AETHER plans multi-step requests, creates tasks automatically, and
              carries what it learns forward. You can inspect, edit or wipe every
              piece of it.
            </p>
            <div className="mt-8 space-y-4">
              {[
                {
                  step: "01",
                  title: "Speak or paste",
                  body: "Ask a question, drop a PDF, or start a mock interview.",
                },
                {
                  step: "02",
                  title: "AETHER routes and plans",
                  body: "Task classification, model routing, web research and a prioritised plan.",
                },
                {
                  step: "03",
                  title: "You keep the context",
                  body: "Study sets, interview reports, code reviews, citations and memory persist.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-4">
                  <span className="font-mono text-xs text-cyan-300/70">
                    {item.step}
                  </span>
                  <div className="border-l border-white/[0.08] pl-4">
                    <p className="text-sm font-medium text-slate-200">
                      {item.title}
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-slate-500">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-transparent p-5 sm:p-7">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Study",
                  title: "7-day DSA revision plan",
                  meta: "12 questions · 6 flashcards",
                  icon: BookOpen,
                },
                {
                  label: "Code",
                  title: "Refactor a FastAPI dependency",
                  meta: "validation passed · 2 fixes",
                  icon: Braces,
                },
                {
                  label: "Interview",
                  title: "Backend mock · 7.8/10",
                  meta: "strengths and gaps saved",
                  icon: Mic,
                },
                {
                  label: "Research",
                  title: "Postgres vs SQLite for AI apps",
                  meta: "6 sources · cited",
                  icon: Globe2,
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-white/[0.07] bg-[#070b14]/80 p-4"
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <card.icon className="h-3.5 w-3.5 text-cyan-300/80" />
                    {card.label}
                  </div>
                  <p className="mt-2 text-[13px] font-medium leading-5 text-slate-200">
                    {card.title}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">{card.meta}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.05] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] text-cyan-100">
                <Brain className="h-3.5 w-3.5" />
                Memory updated: prefers examples before theory
              </div>
              <span className="text-[9px] uppercase tracking-[0.14em] text-cyan-300/60">
                editable
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="relative z-10 border-y border-white/[0.06] bg-[#070a12]/50 py-20 lg:py-28">
        <div className="container">
          <div className="max-w-2xl">
            <p className="text-[10px] uppercase tracking-[0.22em] text-rose-300/80">
              Trust is a feature
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Powerful, without being careless.
            </h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SECURITY.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"
              >
                <item.icon className="h-5 w-5 text-cyan-200" />
                <h3 className="mt-3 font-display text-sm font-semibold text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-[12px] leading-6 text-slate-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-20 lg:py-28">
        <div className="container">
          <div className="relative overflow-hidden rounded-[28px] border border-white/[0.09] bg-gradient-to-br from-cyan-400/[0.08] via-transparent to-violet-500/[0.1] px-6 py-14 text-center sm:px-12">
            <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-cyan-400/15 blur-3xl" />
            <div className="relative">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                <Sparkles className="h-6 w-6 text-cyan-200" />
              </div>
              <h2 className="mx-auto mt-6 max-w-2xl font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Stop re-explaining yourself.
                <br />
                <span className="text-gradient">Start compounding context.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-400">
                Create an account, open the voice assistant, and ask your first
                question. AETHER selects the strongest configured model and keeps
                the conversation moving from there.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild variant="aurora" size="lg">
                  <Link href="/register">
                    Create your workspace <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/login">I already have an account</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] py-10">
        <div className="container flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <AetherLogo />
            <p className="mt-3 max-w-sm text-[11px] leading-5 text-slate-500">
              Adaptive Engine for Thought, Help, Execution &amp; Research. An
              open, deployable reference implementation.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-500">
            <Link href="/login" className="hover:text-slate-300">
              Sign in
            </Link>
            <Link href="/register" className="hover:text-slate-300">
              Create account
            </Link>
            <a
              href="https://github.com/FlameKaiser2201/aether-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300"
            >
              Source
            </a>
            <span>© {new Date().getFullYear()} AETHER</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
