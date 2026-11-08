"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  BookMarked,
  Copy,
  Globe2,
  Link2,
  Loader2,
  Search,
  Sparkles,
  Telescope,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SearchResponse } from "@/lib/types";

const RESULT_COUNTS = [4, 6, 8, 10] as const;

export function ResearchPanel() {
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(6);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  async function runSearch(rawValue: string) {
    const value = rawValue.trim();
    if (!value) {
      toast.error("Enter a research question.");
      return;
    }
    setLoading(true);
    try {
      const data = await api<SearchResponse>("search", {
        method: "POST",
        body: JSON.stringify({ query: value, max_results: maxResults }),
      });
      setResponse(data);
      setHistory((previous) =>
        [value, ...previous.filter((item) => item !== value)].slice(0, 6),
      );
      toast.success(
        data.results.length
          ? `${data.results.length} sources found`
          : "No sources found — try a broader query",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSearch(query);
  }

  async function copyCitation(title: string, url: string) {
    try {
      await navigator.clipboard.writeText(`${title} — ${url}`);
      toast.success("Citation copied");
    } catch {
      toast.error("Clipboard access was blocked by the browser.");
    }
  }

  const researchPrompt = response
    ? `Research this question and synthesize the evidence with citations: ${response.query}`
    : "";
  const researchHref = researchPrompt
    ? `/chat?prompt=${encodeURIComponent(researchPrompt)}&mode=research`
    : "/chat?mode=research";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.75fr)_1.25fr]">
      <div className="space-y-4">
        <form
          onSubmit={search}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-200">
              <Globe2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Research studio
              </h2>
              <p className="text-[10px] text-slate-500">
                Live web search with traceable source citations.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="research-query">Research question</Label>
              <Input
                id="research-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. Latest production trade-offs between PostgreSQL and SQLite"
                maxLength={500}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="research-count">Sources</Label>
              <Select
                id="research-count"
                value={String(maxResults)}
                onChange={(event) => setMaxResults(Number(event.target.value))}
              >
                {RESULT_COUNTS.map((count) => (
                  <option key={count} value={count}>
                    {count} sources
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="submit"
              variant="aurora"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {loading ? "Searching the web…" : "Search sources"}
            </Button>
          </div>
        </form>

        {history.length ? (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
              Recent queries
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {history.map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setQuery(item);
                    void runSearch(item);
                  }}
                  className="max-w-full truncate rounded-full border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[10px] text-slate-400 transition-colors hover:border-cyan-400/20 hover:text-cyan-200"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/[0.06] to-cyan-400/[0.03] p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium text-violet-200">
            <Telescope className="h-3.5 w-3.5" /> Go deeper in research mode
          </div>
          <p className="mt-1.5 text-[10px] leading-5 text-slate-500">
            Search finds the evidence. Research mode compares sources, flags
            disagreements and writes a cited brief.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={researchHref}>
              <Sparkles className="h-3.5 w-3.5" /> Open research chat
            </Link>
          </Button>
        </div>
      </div>

      <div className="min-h-[460px] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm font-semibold text-white">
              Sources
            </h2>
            <p className="text-[10px] text-slate-500">
              {response
                ? `Results for “${response.query}”`
                : "Search the public web to build a cited evidence set"}
            </p>
          </div>
          {response ? (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                {response.provider}
              </Badge>
              <Badge
                variant={response.cached ? "secondary" : "success"}
                className="px-1.5 py-0 text-[9px]"
              >
                {response.cached ? "cached" : "live"}
              </Badge>
            </div>
          ) : null}
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : response ? (
            response.results.length ? (
              <div className="space-y-2.5">
                {response.results.map((result) => (
                  <div
                    key={`${result.index}-${result.url}`}
                    className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.12]"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] font-mono text-[9px] text-cyan-300/80">
                        {result.index}
                      </span>
                      <div className="min-w-0 flex-1">
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-1.5 text-[12.5px] font-medium leading-5 text-slate-200 transition-colors hover:text-cyan-200"
                        >
                          <span className="min-w-0 flex-1">{result.title}</span>
                          <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600 group-hover:text-cyan-300/70" />
                        </a>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[9.5px] text-slate-600">
                          <Link2 className="h-2.5 w-2.5 shrink-0" />
                          {result.url}
                        </p>
                        <p className="mt-1.5 text-[11px] leading-5 text-slate-400">
                          {result.snippet}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() =>
                          void copyCitation(result.title, result.url)
                        }
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] text-slate-500 transition-colors",
                          "hover:bg-white/[0.05] hover:text-slate-300",
                        )}
                      >
                        <Copy className="h-2.5 w-2.5" /> Copy citation
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.03] px-3 py-2.5">
                  <BookMarked className="h-3.5 w-3.5 text-cyan-300/70" />
                  <span className="text-[10px] text-slate-500">
                    Ask AETHER to synthesize these findings into a cited brief.
                  </span>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                  >
                    <Link href={researchHref}>
                      Synthesize <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-10 text-center">
                <Globe2 className="h-6 w-6 text-slate-600" />
                <p className="mt-2 text-[12px] font-medium text-slate-300">
                  No sources found
                </p>
                <p className="mt-1 max-w-sm text-[10px] leading-5 text-slate-600">
                  Try a broader question, remove very recent time constraints, or
                  check that a search provider is configured.
                </p>
              </div>
            )
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <Globe2 className="h-5 w-5 text-cyan-200/70" />
              </div>
              <p className="mt-4 font-display text-base font-semibold text-white">
                Build an evidence set
              </p>
              <p className="mt-1 max-w-sm text-[11px] leading-5 text-slate-500">
                Every result carries its title, URL and snippet so AETHER can
                cite claims instead of inventing them. Research mode then
                compares sources and writes the brief.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
