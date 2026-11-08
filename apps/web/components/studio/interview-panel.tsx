"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Lightbulb,
  Loader2,
  Mic,
  Play,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { ConfirmDialog } from "@/components/studio/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { cn, formatRelative } from "@/lib/utils";
import type {
  InterviewEvaluation,
  InterviewReport,
  InterviewSession,
  InterviewSessionList,
} from "@/lib/types";

const INTERVIEW_TYPES = [
  { value: "mixed", label: "Mixed interview" },
  { value: "hr", label: "HR round" },
  { value: "technical", label: "Technical" },
  { value: "dsa", label: "DSA / problem solving" },
  { value: "system_design", label: "System design" },
  { value: "behavioral", label: "Behavioural" },
] as const;

const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function scoreTone(score: number): string {
  if (score >= 7.5) return "text-emerald-300";
  if (score >= 5) return "text-amber-300";
  return "text-rose-300";
}

function scoreBar(score: number): string {
  if (score >= 7.5) return "from-emerald-400 to-cyan-400";
  if (score >= 5) return "from-amber-400 to-orange-400";
  return "from-rose-400 to-orange-400";
}

function DifficultyBadge({ value }: { value: string }) {
  const variant =
    value === "hard" ? "destructive" : value === "easy" ? "success" : "warning";
  return (
    <Badge variant={variant} className="px-1.5 py-0 text-[9px] capitalize">
      {value}
    </Badge>
  );
}

function ListBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "rose" | "violet";
}) {
  if (!items.length) return null;
  const toneClass = {
    emerald: "text-emerald-300/70",
    rose: "text-rose-300/70",
    violet: "text-violet-300/70",
  }[tone];
  return (
    <div>
      <p className={cn("text-[10px] uppercase tracking-[0.16em]", toneClass)}>
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 text-[11.5px] leading-5 text-slate-400"
          >
            <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportView({
  score,
  overall,
  strengths,
  gaps,
  nextSteps,
  perQuestion,
}: {
  score: number;
  overall: string;
  strengths: string[];
  gaps: string[];
  nextSteps: string[];
  perQuestion?: InterviewReport["per_question"];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-400/[0.07] to-violet-500/[0.06] p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20">
            <span
              className={cn(
                "font-display text-2xl font-semibold",
                scoreTone(score),
              )}
            >
              {score.toFixed(1)}
            </span>
            <span className="text-[8px] uppercase tracking-[0.18em] text-slate-500">
              / 10
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">
              <Trophy className="h-3 w-3" /> Interview report
            </div>
            <p className="mt-1 text-[12px] leading-5 text-slate-300">
              {overall}
            </p>
          </div>
        </div>
        <Progress
          value={score * 10}
          className="mt-4"
          barClassName={scoreBar(score)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <ListBlock title="Strengths" items={strengths} tone="emerald" />
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <ListBlock title="Gaps to close" items={gaps} tone="rose" />
        </div>
      </div>

      <div className="rounded-xl border border-violet-400/15 bg-violet-400/[0.03] p-4">
        <ListBlock title="Next steps" items={nextSteps} tone="violet" />
      </div>

      {perQuestion?.length ? (
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
            Per-question breakdown
          </p>
          <div className="mt-2 space-y-2">
            {perQuestion.map((item) => (
              <details
                key={`${item.index}-${item.question}`}
                className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
              >
                <summary className="flex cursor-pointer list-none items-start gap-3">
                  <span className="mt-0.5 font-mono text-[10px] text-cyan-300/70">
                    Q{item.index + 1}
                  </span>
                  <span className="flex-1 text-[12px] leading-5 text-slate-300">
                    {item.question}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[11px]",
                      scoreTone(item.score),
                    )}
                  >
                    {item.score.toFixed(1)}
                  </span>
                </summary>
                <div className="mt-2 border-t border-white/[0.06] pt-2">
                  {typeof item.feedback?.model_answer === "string" ? (
                    <p className="text-[11px] leading-5 text-slate-500">
                      <span className="text-slate-400">Model answer: </span>
                      {item.feedback.model_answer}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-600">
                      No detailed feedback stored for this answer.
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InterviewPanel() {
  const [role, setRole] = useState("Backend Engineer");
  const [company, setCompany] = useState("General");
  const [type, setType] = useState<(typeof INTERVIEW_TYPES)[number]["value"]>(
    "mixed",
  );
  const [difficulty, setDifficulty] = useState<
    (typeof DIFFICULTIES)[number]["value"]
  >("medium");
  const [count, setCount] = useState(5);
  const [starting, setStarting] = useState(false);

  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [current, setCurrent] = useState<InterviewSession | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [evaluations, setEvaluations] = useState<
    Record<number, InterviewEvaluation>
  >({});
  const [evaluating, setEvaluating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InterviewSession | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api<InterviewSessionList>("interview/sessions");
      setSessions(data.items);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  function selectSession(session: InterviewSession) {
    setCurrent(session);
    setActiveIndex(0);
    setAnswers({});
    setEvaluations({});
    setReport(null);
  }

  async function startSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role.trim()) {
      toast.error("Enter the role you are preparing for.");
      return;
    }
    setStarting(true);
    try {
      const session = await api<InterviewSession>("interview/sessions", {
        method: "POST",
        body: JSON.stringify({
          role: role.trim(),
          company: company.trim() || "General",
          type,
          difficulty,
          question_count: count,
        }),
      });
      setSessions((previous) => [session, ...previous]);
      selectSession(session);
      toast.success("Mock interview ready");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setStarting(false);
    }
  }

  async function submitAnswer() {
    if (!current) return;
    const answer = (answers[activeIndex] ?? "").trim();
    if (answer.length < 1) {
      toast.error("Write your answer before asking for feedback.");
      return;
    }
    setEvaluating(true);
    try {
      const evaluation = await api<InterviewEvaluation>(
        `interview/sessions/${current.id}/answer`,
        {
          method: "POST",
          body: JSON.stringify({
            question_index: activeIndex,
            answer,
          }),
        },
      );
      setEvaluations((previous) => ({
        ...previous,
        [activeIndex]: evaluation,
      }));
      setSessions((previous) =>
        previous.map((session) =>
          session.id === current.id
            ? { ...session, score: evaluation.score }
            : session,
        ),
      );
      toast.success(
        `Question ${activeIndex + 1} scored ${evaluation.score.toFixed(1)}/10`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setEvaluating(false);
    }
  }

  async function finishInterview() {
    if (!current) return;
    setCompleting(true);
    try {
      const result = await api<InterviewReport>(
        `interview/sessions/${current.id}/complete`,
        { method: "POST" },
      );
      setReport(result);
      const updated: InterviewSession = {
        ...current,
        status: "completed",
        score: result.score,
        completed_at: new Date().toISOString(),
        feedback: {
          overall: result.overall,
          strengths: result.strengths,
          gaps: result.gaps,
          next_steps: result.next_steps,
        },
      };
      setCurrent(updated);
      setSessions((previous) =>
        previous.map((session) =>
          session.id === updated.id ? updated : session,
        ),
      );
      toast.success("Interview report ready");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCompleting(false);
    }
  }

  async function removeSession() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`interview/sessions/${deleteTarget.id}`, { method: "DELETE" });
      setSessions((previous) =>
        previous.filter((session) => session.id !== deleteTarget.id),
      );
      if (current?.id === deleteTarget.id) {
        setCurrent(null);
        setReport(null);
      }
      setDeleteTarget(null);
      toast.success("Interview session deleted");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  const question = current?.questions[activeIndex];
  const evaluation = evaluations[activeIndex];
  const answeredCount = Object.keys(evaluations).length;
  const feedback = current?.feedback ?? {};

  function renderSession() {
    if (!current) {
      return (
        <div className="flex h-full min-h-[440px] flex-col items-center justify-center px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <Mic className="h-5 w-5 text-cyan-200/70" />
          </div>
          <p className="mt-4 font-display text-base font-semibold text-white">
            Your interviewer is ready
          </p>
          <p className="mt-1 max-w-sm text-[11px] leading-5 text-slate-500">
            Set the role, company and round, then start a scored mock interview.
            Every answer gets a rubric, strengths and a concrete improvement.
          </p>
        </div>
      );
    }

    if (current.status === "completed") {
      const reportScore = report?.score ?? current.score ?? 0;
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="success" className="px-1.5 py-0 text-[9px]">
                  Completed
                </Badge>
                <Badge variant="outline" className="px-1.5 py-0 text-[9px] capitalize">
                  {current.type.replace("_", " ")}
                </Badge>
                <span className="inline-flex items-center gap-1 text-[9px] text-slate-600">
                  <Clock className="h-2.5 w-2.5" />
                  {formatRelative(current.completed_at ?? current.created_at)}
                </span>
              </div>
              <h2 className="mt-1 font-display text-base font-semibold text-white">
                {current.role}
              </h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrent(null)}
            >
              <Play className="h-3.5 w-3.5" /> New session
            </Button>
          </div>
          <div className="p-4 sm:p-5">
            {report ? (
              <ReportView
                score={report.score}
                overall={report.overall}
                strengths={report.strengths}
                gaps={report.gaps}
                nextSteps={report.next_steps}
                perQuestion={report.per_question}
              />
            ) : (
              <ReportView
                score={reportScore}
                overall={
                  typeof feedback.overall === "string"
                    ? feedback.overall
                    : "This session is complete."
                }
                strengths={asStringArray(feedback.strengths)}
                gaps={asStringArray(feedback.gaps)}
                nextSteps={asStringArray(feedback.next_steps)}
              />
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-start gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="px-1.5 py-0 text-[9px] capitalize">
                {current.type.replace("_", " ")}
              </Badge>
              <DifficultyBadge value={current.difficulty} />
              <span className="inline-flex items-center gap-1 text-[9px] text-slate-600">
                <Clock className="h-2.5 w-2.5" />
                {formatRelative(current.created_at)}
              </span>
            </div>
            <h2 className="mt-1 font-display text-base font-semibold text-white">
              {current.role}
            </h2>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
              <Building2 className="h-3 w-3" /> {current.company} ·{" "}
              {answeredCount}/{current.questions.length} answered
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[0.16em] text-slate-600">
              Session score
            </p>
            <p
              className={cn(
                "font-display text-xl font-semibold",
                current.score != null ? scoreTone(current.score) : "text-slate-600",
              )}
            >
              {current.score != null ? current.score.toFixed(1) : "—"}
            </p>
          </div>
        </div>

        <div className="border-b border-white/[0.06] px-4 py-2.5 sm:px-5">
          <div className="flex flex-wrap gap-1.5">
            {current.questions.map((item, index) => {
              const done = Boolean(evaluations[index]);
              return (
                <button
                  key={`${item.question}-${index}`}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "flex h-7 min-w-7 items-center justify-center gap-1 rounded-lg border px-2 font-mono text-[10px] transition-colors",
                    activeIndex === index
                      ? "border-cyan-400/30 bg-cyan-400/[0.1] text-cyan-200"
                      : done
                        ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200/80"
                        : "border-white/[0.07] bg-white/[0.02] text-slate-500 hover:text-slate-300",
                  )}
                >
                  {done ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin sm:p-5">
          {question ? (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] text-cyan-300/70">
                    Q{activeIndex + 1}
                  </span>
                  <Badge variant="outline" className="px-1.5 py-0 text-[9px] capitalize">
                    {question.category.replace("_", " ")}
                  </Badge>
                  <DifficultyBadge value={question.difficulty} />
                </div>
                <p className="mt-2 text-[13px] leading-6 text-slate-200">
                  {question.question}
                </p>
                {question.hint ? (
                  <details className="mt-3 rounded-lg border border-amber-400/10 bg-amber-400/[0.03] px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] text-amber-200/80">
                      <Lightbulb className="h-3 w-3" /> Show hint
                    </summary>
                    <p className="mt-1.5 text-[11px] leading-5 text-slate-400">
                      {question.hint}
                    </p>
                  </details>
                ) : null}
              </div>

              {evaluation ? (
                <div className="space-y-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "font-display text-2xl font-semibold",
                        scoreTone(evaluation.score),
                      )}
                    >
                      {evaluation.score.toFixed(1)}
                    </span>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-200/70">
                        Answer score
                      </p>
                      <Progress
                        value={evaluation.score * 10}
                        className="mt-1.5"
                        barClassName={scoreBar(evaluation.score)}
                      />
                    </div>
                  </div>

                  {Object.keys(evaluation.rubric).length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Object.entries(evaluation.rubric).map(([key, value]) => (
                        <div key={key}>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="capitalize text-slate-400">
                              {key.replace("_", " ")}
                            </span>
                            <span className="font-mono text-slate-500">
                              {Number(value).toFixed(1)}
                            </span>
                          </div>
                          <Progress
                            value={Number(value) * 10}
                            className="mt-1 h-1"
                            barClassName={scoreBar(Number(value))}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <ListBlock
                    title="What worked"
                    items={evaluation.strengths}
                    tone="emerald"
                  />
                  <ListBlock
                    title="What to improve"
                    items={evaluation.improvements}
                    tone="rose"
                  />
                  {evaluation.model_answer ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300/70">
                        Strong answer outline
                      </p>
                      <Markdown
                        content={evaluation.model_answer}
                        className="mt-1 text-[11.5px]"
                      />
                    </div>
                  ) : null}

                  {evaluation.next_question ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setActiveIndex(evaluation.next_question?.index ?? 0)
                      }
                    >
                      Next question <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="interview-answer">Your answer</Label>
                  <Textarea
                    id="interview-answer"
                    value={answers[activeIndex] ?? ""}
                    onChange={(event) =>
                      setAnswers((previous) => ({
                        ...previous,
                        [activeIndex]: event.target.value,
                      }))
                    }
                    placeholder="Structure it: situation, decision, action, result. Include trade-offs and measurable outcomes."
                    rows={7}
                    maxLength={10000}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="aurora"
                      onClick={() => void submitAnswer()}
                      disabled={evaluating}
                    >
                      {evaluating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {evaluating ? "Scoring answer…" : "Score my answer"}
                    </Button>
                    <span className="text-[10px] text-slate-600">
                      {(answers[activeIndex] ?? "").trim().split(/\s+/).filter(Boolean).length}{" "}
                      words
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-slate-500">
              This question could not be loaded.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-3 sm:px-5">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Target className="h-3 w-3 text-cyan-300/70" />
            Answer at least one question to unlock the report.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => void finishInterview()}
            disabled={completing || answeredCount === 0}
          >
            {completing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trophy className="h-3.5 w-3.5" />
            )}
            {completing ? "Building report…" : "Finish & report"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.85fr)_1.15fr]">
      <div className="space-y-4">
        <form
          onSubmit={startSession}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-200">
              <Mic className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Interview studio
              </h2>
              <p className="text-[10px] text-slate-500">
                Scored mock interviews with rubrics and a final report.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="interview-role">Role</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="interview-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  placeholder="e.g. Backend Engineer"
                  maxLength={120}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="interview-company">Company</Label>
                <Input
                  id="interview-company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="General"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interview-type">Round</Label>
                <Select
                  id="interview-type"
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as typeof type)
                  }
                >
                  {INTERVIEW_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="interview-difficulty">Difficulty</Label>
                <Select
                  id="interview-difficulty"
                  value={difficulty}
                  onChange={(event) =>
                    setDifficulty(event.target.value as typeof difficulty)
                  }
                >
                  {DIFFICULTIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interview-count">
                  Questions · {count}
                </Label>
                <input
                  id="interview-count"
                  type="range"
                  min={1}
                  max={12}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                  className="mt-3 w-full accent-cyan-400"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="aurora"
              className="w-full"
              disabled={starting}
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {starting ? "Preparing questions…" : "Start mock interview"}
            </Button>
          </div>
        </form>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
              Recent sessions
            </p>
            <span className="text-[10px] text-slate-600">{sessions.length}</span>
          </div>
          <div className="mt-2 space-y-1">
            {loadingSessions ? (
              [0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-11 w-full rounded-lg" />
              ))
            ) : sessions.length ? (
              sessions.slice(0, 12).map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                    current?.id === session.id
                      ? "bg-white/[0.06]"
                      : "hover:bg-white/[0.04]",
                  )}
                >
                  <button
                    onClick={() => selectSession(session)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[11px] text-slate-300">
                      {session.role}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-600">
                      <Badge
                        variant={
                          session.status === "completed" ? "success" : "outline"
                        }
                        className="px-1 py-0 text-[8px] capitalize"
                      >
                        {session.status}
                      </Badge>
                      {session.company} · {formatRelative(session.created_at)}
                      {session.score != null
                        ? ` · ${session.score.toFixed(1)}/10`
                        : ""}
                    </span>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(session)}
                    className="rounded p-1 text-slate-600 opacity-0 transition-all hover:bg-rose-400/10 hover:text-rose-300 group-hover:opacity-100"
                    aria-label="Delete interview session"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            ) : (
              <p className="py-3 text-center text-[10px] text-slate-600">
                Mock interviews will appear here.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-[460px] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        {renderSession()}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete this interview?"
        description="The session, every answer and its scoring feedback will be permanently removed."
        busy={deleting}
        onConfirm={() => void removeSession()}
      />
    </div>
  );
}
