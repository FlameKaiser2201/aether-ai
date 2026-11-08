"use client";

import { useState } from "react";
import {
  BookOpen,
  Bug,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { LANGUAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  CodeActionResponse,
  ValidationIssue,
  ValidationReport,
} from "@/lib/types";

type CodeAction = "validate" | "review" | "refactor" | "debug" | "explain";
type ResultTab = "output" | "code" | "checks";

const ACTIONS: Array<{
  value: CodeAction;
  label: string;
  icon: typeof ShieldCheck;
  hint: string;
}> = [
  {
    value: "validate",
    label: "Validate",
    icon: ShieldCheck,
    hint: "Syntax, structure, security and placeholder checks",
  },
  {
    value: "review",
    label: "Review",
    icon: ClipboardCheck,
    hint: "Correctness, edge cases, security and performance",
  },
  {
    value: "refactor",
    label: "Refactor",
    icon: Wand2,
    hint: "Cleaner, safer code with the same behaviour",
  },
  {
    value: "debug",
    label: "Debug",
    icon: Bug,
    hint: "Find the root cause and the minimal fix",
  },
  {
    value: "explain",
    label: "Explain",
    icon: BookOpen,
    hint: "Walk through the code line by line",
  },
];

const EXAMPLE = `def top_k_frequent(nums: list[int], k: int) -> list[int]:
    counts = {}
    for num in nums:
        counts[num] = counts.get(num, 0) + 1
    return sorted(counts, key=counts.get, reverse=True)[:k]`;

function severityIcon(issue: ValidationIssue) {
  if (issue.severity === "error") {
    return <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />;
  }
  if (issue.severity === "warning") {
    return (
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
    );
  }
  return (
    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
  );
}

function severityBadge(severity: ValidationIssue["severity"]) {
  const variant =
    severity === "error"
      ? "destructive"
      : severity === "warning"
        ? "warning"
        : "default";
  return (
    <Badge variant={variant} className="px-1.5 py-0 text-[9px] capitalize">
      {severity}
    </Badge>
  );
}

function ValidationView({ report }: { report: ValidationReport }) {
  const errors = report.issues.filter((item) => item.severity === "error").length;
  const warnings = report.issues.filter(
    (item) => item.severity === "warning",
  ).length;
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5",
          report.ok
            ? "border-emerald-400/15 bg-emerald-400/[0.05]"
            : "border-rose-400/15 bg-rose-400/[0.05]",
        )}
      >
        {report.ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-300" />
        )}
        <span className="text-[12px] font-medium text-slate-200">
          {report.ok ? "No blocking issues found" : "Blocking issues found"}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="px-1.5 py-0 text-[9px] capitalize">
            {report.language}
          </Badge>
          {errors ? (
            <Badge variant="destructive" className="px-1.5 py-0 text-[9px]">
              {errors} error{errors === 1 ? "" : "s"}
            </Badge>
          ) : null}
          {warnings ? (
            <Badge variant="warning" className="px-1.5 py-0 text-[9px]">
              {warnings} warning{warnings === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </span>
      </div>

      {Object.keys(report.stats).length ? (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(report.stats).map(([key, value]) => (
            <span
              key={key}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1 font-mono text-[9px] text-slate-500"
            >
              {key}: <span className="text-slate-300">{String(value)}</span>
            </span>
          ))}
        </div>
      ) : null}

      {report.issues.length ? (
        <div className="space-y-2">
          {report.issues.map((issue, index) => (
            <div
              key={`${issue.rule}-${index}`}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {severityIcon(issue)}
                {severityBadge(issue.severity)}
                <span className="font-mono text-[9px] text-slate-500">
                  {issue.rule}
                </span>
                {issue.line ? (
                  <span className="ml-auto font-mono text-[9px] text-slate-600">
                    line {issue.line}
                    {issue.column ? `:${issue.column}` : ""}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[11.5px] leading-5 text-slate-300">
                {issue.message}
              </p>
              {issue.suggestion ? (
                <p className="mt-1 text-[10.5px] leading-5 text-slate-500">
                  <span className="text-cyan-300/70">Fix: </span>
                  {issue.suggestion}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-300/70" />
          <p className="mt-2 text-[11.5px] font-medium text-slate-300">
            Clean pass
          </p>
          <p className="mt-1 max-w-xs text-[10px] leading-5 text-slate-600">
            No syntax, delimiter, security or placeholder problems were
            detected by the static checks.
          </p>
        </div>
      )}

      {report.checked.length ? (
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-slate-600">
            Checks performed
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {report.checked.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/[0.07] px-1.5 py-0.5 text-[9px] text-slate-500"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CodePanel() {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState<CodeAction | null>(null);
  const [response, setResponse] = useState<CodeActionResponse | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [tab, setTab] = useState<ResultTab>("output");

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Clipboard access was blocked by the browser.");
    }
  }

  async function run(action: CodeAction) {
    if (!code.trim()) {
      toast.error("Paste or write some code first.");
      return;
    }
    setRunning(action);
    try {
      const payload = {
        code,
        language: language === "auto" ? null : language,
        goal: goal.trim() || null,
      };
      if (action === "validate") {
        const report = await api<ValidationReport>("code/validate", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setValidation(report);
        setResponse(null);
        setTab("checks");
        toast.success(
          report.ok
            ? "Validation passed with no blocking issues"
            : "Validation found issues to fix",
        );
      } else {
        const result = await api<CodeActionResponse>(`code/${action}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setResponse(result);
        setValidation(result.validation);
        setTab("output");
        toast.success(
          `${action.charAt(0).toUpperCase()}${action.slice(1)} complete`,
        );
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRunning(null);
    }
  }

  const resultCode = response?.code ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-200">
            <Code2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-sm font-semibold text-white">
              Code studio
            </h2>
            <p className="text-[10px] text-slate-500">
              Validate, review, refactor, debug or explain production code.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => {
              setCode(EXAMPLE);
              setLanguage("python");
              setGoal("Return the k most frequent elements in any order.");
            }}
          >
            Load example
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-1.5">
              <Label htmlFor="code-language">Language</Label>
              <Select
                id="code-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="auto">Auto-detect</option>
                {LANGUAGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code-goal">
                Goal <span className="text-slate-600">(optional)</span>
              </Label>
              <Input
                id="code-goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="e.g. Fix the race condition without changing the API"
                maxLength={2000}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="code-source">Source code</Label>
              <span className="font-mono text-[9px] text-slate-600">
                {code.split("\n").length} lines
              </span>
            </div>
            <Textarea
              id="code-source"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Paste code here. Include the failing traceback in the goal field for debugging."
              spellCheck={false}
              rows={16}
              maxLength={100000}
              className="min-h-[320px] resize-y font-mono text-[12px] leading-5"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              const primary = action.value === "review";
              return (
                <Button
                  key={action.value}
                  type="button"
                  variant={primary ? "aurora" : "outline"}
                  size="sm"
                  title={action.hint}
                  onClick={() => void run(action.value)}
                  disabled={running !== null}
                >
                  {running === action.value ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  {action.label}
                </Button>
              );
            })}
          </div>
          <p className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <ShieldCheck className="h-3 w-3 text-cyan-300/60" />
            Generated code is statically checked once and repaired when the
            validator finds blocking issues.
          </p>
        </div>
      </div>

      <div className="min-h-[520px] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm font-semibold text-white">
              Analysis
            </h2>
            <p className="text-[10px] text-slate-500">
              {response
                ? `${response.provider} · ${response.model}`
                : validation
                  ? "Static validation report"
                  : "Run an action to see results"}
            </p>
          </div>
          {validation ? (
            <Badge
              variant={validation.ok ? "success" : "destructive"}
              className="px-1.5 py-0 text-[9px]"
            >
              {validation.ok ? "checks passed" : "needs fixes"}
            </Badge>
          ) : null}
          {resultCode ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void copyText(resultCode)}
              aria-label="Copy generated code"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>

        {response || validation ? (
          <div className="p-4 sm:p-5">
            <Tabs value={tab} onValueChange={(value) => setTab(value as ResultTab)}>
              <TabsList>
                <TabsTrigger value="output">Output</TabsTrigger>
                {resultCode ? (
                  <TabsTrigger value="code">Code</TabsTrigger>
                ) : null}
                {validation ? (
                  <TabsTrigger value="checks">
                    Checks
                    {validation.issues.length ? (
                      <span className="ml-1 rounded-full bg-white/10 px-1 font-mono text-[8px]">
                        {validation.issues.length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent value="output">
                {response ? (
                  <div className="space-y-3">
                    <Markdown content={response.result} />
                    <p className="flex items-center gap-1.5 border-t border-white/[0.06] pt-3 text-[9px] text-slate-600">
                      <Sparkles className="h-3 w-3" /> Routed to{" "}
                      {response.provider}/{response.model}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-4 py-10 text-center">
                    <ShieldCheck className="h-6 w-6 text-cyan-300/70" />
                    <p className="mt-2 text-[11.5px] font-medium text-slate-300">
                      Validation only
                    </p>
                    <p className="mt-1 max-w-xs text-[10px] leading-5 text-slate-600">
                      Static checks ran without an LLM. Switch to the Checks tab
                      for the full report, or run Review for deeper analysis.
                    </p>
                  </div>
                )}
              </TabsContent>

              {resultCode ? (
                <TabsContent value="code">
                  <pre className="max-h-[520px] overflow-auto rounded-xl border border-white/[0.07] bg-black/40 p-4 font-mono text-[11.5px] leading-5 text-slate-300 scrollbar-thin">
                    <code>{resultCode}</code>
                  </pre>
                </TabsContent>
              ) : null}

              {validation ? (
                <TabsContent value="checks">
                  <ValidationView report={validation} />
                </TabsContent>
              ) : null}
            </Tabs>
          </div>
        ) : (
          <div className="flex min-h-[460px] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <Code2 className="h-5 w-5 text-cyan-200/70" />
            </div>
            <p className="mt-4 font-display text-base font-semibold text-white">
              Paste code to get started
            </p>
            <p className="mt-1 max-w-sm text-[11px] leading-5 text-slate-500">
              AETHER checks syntax and structure before it reviews logic, edge
              cases, security and performance. Every generated fix is validated
              again before it reaches you.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {["Python", "TypeScript", "Go", "Rust", "SQL", "Java"].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[9px] text-slate-500"
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
