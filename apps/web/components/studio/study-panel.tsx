"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileQuestion,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { STUDY_KINDS } from "@/lib/constants";
import { cn, formatRelative } from "@/lib/utils";
import type { StudyKind, StudySet, StudySetList } from "@/lib/types";

interface NoteSection {
  heading?: string;
  content?: string;
  key_points?: string[];
}
interface KeyTerm {
  term?: string;
  definition?: string;
}
interface StudyQuestion {
  question?: string;
  difficulty?: string;
  marks?: number;
  answer?: string;
  topic?: string;
}
interface QuizQuestion {
  question?: string;
  options?: string[];
  correct_index?: number;
  explanation?: string;
  difficulty?: string;
}
interface Flashcard {
  front?: string;
  back?: string;
  tags?: string[];
}
interface DayPlan {
  day?: number;
  focus?: string;
  activities?: string[];
  checkpoint?: string;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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

export function StudyPanel() {
  const [kind, setKind] = useState<StudyKind>("notes");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced" | "exam">(
    "intermediate",
  );
  const [count, setCount] = useState(10);
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [current, setCurrent] = useState<StudySet | null>(null);
  const [sets, setSets] = useState<StudySet[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  const loadSets = useCallback(async () => {
    try {
      const data = await api<StudySetList>("study/sets");
      setSets(data.items);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingSets(false);
    }
  }, []);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  useEffect(() => {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setFlipped(new Set());
  }, [current?.id]);

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!topic.trim()) {
      toast.error("Enter a topic to study.");
      return;
    }
    setGenerating(true);
    try {
      const set = await api<StudySet>("study/generate", {
        method: "POST",
        body: JSON.stringify({
          kind,
          topic: topic.trim(),
          level,
          count,
          context: context.trim() || null,
          language: "auto",
        }),
      });
      setCurrent(set);
      setSets((previous) => [set, ...previous]);
      toast.success("Study set generated");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setGenerating(false);
    }
  }

  async function removeSet(id: string) {
    setDeletingId(id);
    try {
      await api(`study/sets/${id}`, { method: "DELETE" });
      setSets((previous) => previous.filter((set) => set.id !== id));
      if (current?.id === id) setCurrent(null);
      toast.success("Study set deleted");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  function toggleCard(index: number) {
    setFlipped((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const content = current?.content ?? {};
  const quizQuestions = arr<QuizQuestion>(content.questions);
  const quizScore = quizQuestions.reduce(
    (total, question, index) =>
      total + (quizAnswers[index] === question.correct_index ? 1 : 0),
    0,
  );

  function renderContent() {
    if (!current) return null;
    switch (current.kind) {
      case "notes": {
        const sections = arr<NoteSection>(content.sections);
        const keyTerms = arr<KeyTerm>(content.key_terms);
        return (
          <div className="space-y-5">
            {content.overview ? (
              <Markdown content={str(content.overview)} />
            ) : null}
            {sections.map((section, index) => (
              <div
                key={`${section.heading}-${index}`}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <h3 className="font-display text-sm font-semibold text-white">
                  {section.heading ?? `Section ${index + 1}`}
                </h3>
                {section.content ? (
                  <Markdown content={section.content} className="mt-1 text-[13px]" />
                ) : null}
                {section.key_points?.length ? (
                  <ul className="mt-2 space-y-1">
                    {section.key_points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2 text-[12px] leading-5 text-slate-400"
                      >
                        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-cyan-300/70" />
                        {point}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            {keyTerms.length ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  Key terms
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {keyTerms.map((term, index) => (
                    <div
                      key={`${term.term}-${index}`}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                    >
                      <p className="text-[11px] font-medium text-cyan-200">
                        {term.term}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-5 text-slate-400">
                        {term.definition}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {arr<string>(content.common_mistakes).length ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-rose-300/70">
                  Common mistakes
                </p>
                <ul className="mt-2 space-y-1">
                  {arr<string>(content.common_mistakes).map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[12px] leading-5 text-slate-400"
                    >
                      <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-300/60" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {arr<string>(content.practice).length ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-300/70">
                  Practice
                </p>
                <ul className="mt-2 space-y-1">
                  {arr<string>(content.practice).map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[12px] leading-5 text-slate-400"
                    >
                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300/60" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      }
      case "summary":
        return (
          <div className="space-y-5">
            <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4">
              <p className="text-[9px] uppercase tracking-[0.18em] text-cyan-300/70">
                TL;DR
              </p>
              <p className="mt-1.5 text-[13px] leading-6 text-slate-200">
                {str(content.tldr)}
              </p>
            </div>
            {arr<string>(content.key_points).length ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  Key points
                </p>
                <ul className="mt-2 space-y-1.5">
                  {arr<string>(content.key_points).map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 text-[12px] leading-5 text-slate-300"
                    >
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-cyan-300/70" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {content.details ? (
              <Markdown content={str(content.details)} />
            ) : null}
            {arr<string>(content.check_yourself).length ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-violet-300/70">
                  Check yourself
                </p>
                <ul className="mt-2 space-y-1">
                  {arr<string>(content.check_yourself).map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[12px] leading-5 text-slate-400"
                    >
                      <FileQuestion className="mt-0.5 h-3 w-3 shrink-0 text-violet-300/60" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      case "questions":
        return (
          <div className="space-y-2">
            {arr<StudyQuestion>(content.questions).map((question, index) => (
              <details
                key={`${question.question}-${index}`}
                className="group rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
              >
                <summary className="flex cursor-pointer list-none items-start gap-3">
                  <span className="mt-0.5 font-mono text-[10px] text-cyan-300/70">
                    Q{index + 1}
                  </span>
                  <span className="flex-1 text-[12.5px] leading-6 text-slate-200">
                    {question.question}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {question.marks ? (
                      <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                        {question.marks} marks
                      </Badge>
                    ) : null}
                    {question.difficulty ? (
                      <DifficultyBadge value={question.difficulty} />
                    ) : null}
                  </span>
                </summary>
                {question.answer ? (
                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">
                      Answer guide
                    </p>
                    <Markdown content={question.answer} className="mt-1 text-[12px]" />
                  </div>
                ) : null}
              </details>
            ))}
          </div>
        );
      case "quiz":
        return (
          <div className="space-y-3">
            {quizSubmitted ? (
              <div className="flex items-center gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] px-4 py-3">
                <span className="font-display text-2xl font-semibold text-cyan-200">
                  {quizScore}/{quizQuestions.length}
                </span>
                <span className="text-[11px] leading-5 text-slate-400">
                  {quizScore === quizQuestions.length
                    ? "Perfect score. Move to a harder set."
                    : "Review the explanations below, then try again."}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    setQuizAnswers({});
                    setQuizSubmitted(false);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            ) : null}
            {quizQuestions.map((question, index) => {
              const selected = quizAnswers[index];
              return (
                <div
                  key={`${question.question}-${index}`}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-mono text-[10px] text-cyan-300/70">
                      {index + 1}.
                    </span>
                    <p className="flex-1 text-[12.5px] leading-6 text-slate-200">
                      {question.question}
                    </p>
                    {question.difficulty ? (
                      <DifficultyBadge value={question.difficulty} />
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {(question.options ?? []).map((option, optionIndex) => {
                      const isSelected = selected === optionIndex;
                      const isCorrect = question.correct_index === optionIndex;
                      const showResult = quizSubmitted;
                      return (
                        <button
                          key={`${option}-${optionIndex}`}
                          onClick={() =>
                            !quizSubmitted &&
                            setQuizAnswers((previous) => ({
                              ...previous,
                              [index]: optionIndex,
                            }))
                          }
                          disabled={quizSubmitted}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] leading-5 transition-colors",
                            showResult && isCorrect
                              ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-100"
                              : showResult && isSelected && !isCorrect
                                ? "border-rose-400/30 bg-rose-400/[0.08] text-rose-100"
                                : isSelected
                                  ? "border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-100"
                                  : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/[0.14] hover:text-slate-200",
                          )}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current/30 font-mono text-[8px]">
                            {String.fromCharCode(65 + optionIndex)}
                          </span>
                          {option}
                          {showResult && isCorrect ? (
                            <CheckCircle2 className="ml-auto h-3 w-3 shrink-0 text-emerald-300" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {quizSubmitted && question.explanation ? (
                    <p className="mt-2 text-[11px] leading-5 text-slate-500">
                      <span className="text-slate-400">Why: </span>
                      {question.explanation}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {!quizSubmitted && quizQuestions.length ? (
              <Button
                variant="aurora"
                onClick={() => setQuizSubmitted(true)}
                disabled={Object.keys(quizAnswers).length < quizQuestions.length}
              >
                Check answers
              </Button>
            ) : null}
          </div>
        );
      case "flashcards": {
        const cards = arr<Flashcard>(content.cards);
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Tap a card to flip · {flipped.size}/{cards.length} reviewed
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFlipped(new Set())}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {cards.map((card, index) => {
                const isFlipped = flipped.has(index);
                return (
                  <button
                    key={`${card.front}-${index}`}
                    onClick={() => toggleCard(index)}
                    className={cn(
                      "flex min-h-[130px] flex-col rounded-xl border p-4 text-left transition-all",
                      isFlipped
                        ? "border-violet-400/25 bg-violet-400/[0.06]"
                        : "border-white/[0.07] bg-white/[0.025] hover:border-cyan-400/20",
                    )}
                  >
                    <span className="text-[9px] uppercase tracking-[0.16em] text-slate-500">
                      {isFlipped ? "Back" : "Front"} · card {index + 1}
                    </span>
                    <span className="mt-2 flex-1 text-[12.5px] leading-6 text-slate-200">
                      {isFlipped ? card.back : card.front}
                    </span>
                    {card.tags?.length ? (
                      <span className="mt-2 flex flex-wrap gap-1">
                        {card.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/[0.08] px-1.5 py-0 text-[8px] text-slate-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      case "revision_plan":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                {str(content.total_days, "7")} days
              </Badge>
              <span className="text-[10px] text-slate-500">
                Checkpoints keep the plan honest.
              </span>
            </div>
            {arr<DayPlan>(content.daily_plan).map((day, index) => (
              <div
                key={`${day.day}-${index}`}
                className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 pl-11"
              >
                <span className="absolute left-3 top-4 flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/20 to-violet-500/20 font-mono text-[10px] text-cyan-200">
                  {day.day ?? index + 1}
                </span>
                <p className="text-[12px] font-medium text-slate-200">
                  {day.focus}
                </p>
                {day.activities?.length ? (
                  <ul className="mt-1.5 space-y-1">
                    {day.activities.map((activity) => (
                      <li
                        key={activity}
                        className="flex items-start gap-1.5 text-[11px] leading-5 text-slate-400"
                      >
                        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-cyan-300/60" />
                        {activity}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {day.checkpoint ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-400/15 bg-emerald-400/[0.04] px-2 py-1 text-[10px] text-emerald-200/80">
                    <CheckCircle2 className="h-3 w-3" /> {day.checkpoint}
                  </p>
                ) : null}
              </div>
            ))}
            {arr<string>(content.milestones).length ? (
              <div className="rounded-xl border border-violet-400/15 bg-violet-400/[0.03] p-4">
                <p className="text-[9px] uppercase tracking-[0.16em] text-violet-300/70">
                  Milestones
                </p>
                <ul className="mt-2 space-y-1">
                  {arr<string>(content.milestones).map((milestone) => (
                    <li
                      key={milestone}
                      className="flex items-start gap-1.5 text-[11px] leading-5 text-slate-400"
                    >
                      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-300/60" />
                      {milestone}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      default:
        return (
          <pre className="overflow-x-auto rounded-xl border border-white/[0.07] bg-black/30 p-4 text-[11px] text-slate-300">
            {JSON.stringify(content, null, 2)}
          </pre>
        );
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.85fr)_1.15fr]">
      <div className="space-y-4">
        <form
          onSubmit={generate}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-200">
              <BookOpen className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Study studio
              </h2>
              <p className="text-[10px] text-slate-500">
                Notes, quizzes and revision plans grounded in your material.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="study-kind">Artifact</Label>
                <Select
                  id="study-kind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as StudyKind)}
                >
                  {STUDY_KINDS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="study-level">Level</Label>
                <Select
                  id="study-level"
                  value={level}
                  onChange={(event) =>
                    setLevel(event.target.value as typeof level)
                  }
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="exam">Exam-focused</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="study-topic">Topic</Label>
              <Input
                id="study-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="e.g. Database normalization and BCNF"
                maxLength={500}
                required
              />
            </div>
            {["questions", "quiz", "flashcards"].includes(kind) ? (
              <div className="space-y-1.5">
                <Label htmlFor="study-count">Number of items · {count}</Label>
                <input
                  id="study-count"
                  type="range"
                  min={1}
                  max={30}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="study-context">
                Source material <span className="text-slate-600">(optional)</span>
              </Label>
              <Textarea
                id="study-context"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Paste notes, a transcript or a document excerpt. AETHER will treat it as the primary source."
                rows={4}
                maxLength={20000}
              />
            </div>
            <Button
              type="submit"
              variant="aurora"
              className="w-full"
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating ? "Building your study set…" : "Generate study set"}
            </Button>
          </div>
        </form>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
              Recent sets
            </p>
            <span className="text-[10px] text-slate-600">{sets.length}</span>
          </div>
          <div className="mt-2 space-y-1">
            {loadingSets ? (
              [0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-10 w-full rounded-lg" />
              ))
            ) : sets.length ? (
              sets.slice(0, 12).map((set) => (
                <div
                  key={set.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                    current?.id === set.id
                      ? "bg-white/[0.06]"
                      : "hover:bg-white/[0.04]",
                  )}
                >
                  <button
                    onClick={() => setCurrent(set)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[11px] text-slate-300">
                      {set.topic}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-600">
                      <Layers className="h-2.5 w-2.5" />
                      {set.kind.replace("_", " ")} · {formatRelative(set.created_at)}
                    </span>
                  </button>
                  <button
                    onClick={() => void removeSet(set.id)}
                    disabled={deletingId === set.id}
                    className="rounded p-1 text-slate-600 opacity-0 transition-all hover:bg-rose-400/10 hover:text-rose-300 group-hover:opacity-100"
                    aria-label="Delete study set"
                  >
                    {deletingId === set.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </div>
              ))
            ) : (
              <p className="py-3 text-center text-[10px] text-slate-600">
                Generated sets will appear here.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-[420px] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        {current ? (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-start gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="px-1.5 py-0 text-[9px] capitalize">
                    {current.kind.replace("_", " ")}
                  </Badge>
                  <Badge variant="outline" className="px-1.5 py-0 text-[9px] capitalize">
                    {current.level}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-[9px] text-slate-600">
                    <Clock className="h-2.5 w-2.5" />
                    {formatRelative(current.created_at)}
                  </span>
                </div>
                <h2 className="mt-1 font-display text-base font-semibold text-white">
                  {current.topic}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void removeSet(current.id)}
                disabled={deletingId === current.id}
                aria-label="Delete study set"
              >
                <Trash2 className="h-4 w-4 text-rose-300/70" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-5">
              {renderContent()}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <BookOpen className="h-5 w-5 text-cyan-200/70" />
            </div>
            <p className="mt-4 font-display text-base font-semibold text-white">
              Your study set appears here
            </p>
            <p className="mt-1 max-w-sm text-[11px] leading-5 text-slate-500">
              Choose an artifact, add a topic, and optionally paste the source
              material you want AETHER to ground it in.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
