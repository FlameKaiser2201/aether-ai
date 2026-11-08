"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Brain,
  Loader2,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { MEMORY_CATEGORIES } from "@/lib/constants";
import { cn, formatRelative } from "@/lib/utils";
import type { Memory, MemoryList } from "@/lib/types";

const CATEGORY_STYLES: Record<string, string> = {
  identity: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  preference: "border-violet-400/20 bg-violet-400/10 text-violet-200",
  goal: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  project: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  skill: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  relationship: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  schedule: "border-orange-400/20 bg-orange-400/10 text-orange-200",
  fact: "border-slate-400/20 bg-slate-400/10 text-slate-200",
};

interface MemoryForm {
  category: string;
  key: string;
  value: string;
  confidence: number;
}

const EMPTY_FORM: MemoryForm = {
  category: "fact",
  key: "",
  value: "",
  confidence: 0.9,
};

export function MemoryView() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [form, setForm] = useState<MemoryForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  async function loadMemories() {
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (query.trim()) params.set("q", query.trim());
      const data = await api<MemoryList>(
        `memories${params.toString() ? `?${params.toString()}` : ""}`,
      );
      setMemories(data.items);
      setCounts(data.categories);
      setTotal(data.total);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(
      async () => {
        try {
          const params = new URLSearchParams();
          if (category) params.set("category", category);
          if (query.trim()) params.set("q", query.trim());
          const data = await api<MemoryList>(
            `memories${params.toString() ? `?${params.toString()}` : ""}`,
          );
          if (!cancelled) {
            setMemories(data.items);
            setCounts(data.categories);
            setTotal(data.total);
          }
        } catch (error) {
          if (!cancelled) toast.error(errorMessage(error));
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      query ? 300 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [category, query]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(memory: Memory) {
    setEditing(memory);
    setForm({
      category: memory.category,
      key: memory.key,
      value: memory.value,
      confidence: memory.confidence,
    });
    setDialogOpen(true);
  }

  async function saveMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.key.trim() || !form.value.trim()) {
      toast.error("A memory needs both a key and a value.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api<Memory>(`memories/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
        toast.success("Memory updated");
      } else {
        await api<Memory>("memories", {
          method: "POST",
          body: JSON.stringify(form),
        });
        toast.success("Memory stored");
      }
      setDialogOpen(false);
      await loadMemories();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteMemory() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`memories/${deleteTarget.id}`, { method: "DELETE" });
      setMemories((previous) =>
        previous.filter((memory) => memory.id !== deleteTarget.id),
      );
      setCounts((previous) => {
        const next = { ...previous };
        const count = (next[deleteTarget.category] ?? 1) - 1;
        if (count <= 0) delete next[deleteTarget.category];
        else next[deleteTarget.category] = count;
        return next;
      });
      setTotal((previous) => Math.max(0, previous - 1));
      toast.success("Memory forgotten");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  async function wipeMemories() {
    setWiping(true);
    try {
      const result = await api<{ deleted: number }>("memories", {
        method: "DELETE",
      });
      setMemories([]);
      setCounts({});
      setTotal(0);
      setWipeOpen(false);
      toast.success(
        `${result.deleted} memor${result.deleted === 1 ? "y" : "ies"} permanently deleted`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setWiping(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <Brain className="h-3.5 w-3.5 text-cyan-300/80" /> Long-term context
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Memory
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-500">
            Durable facts AETHER uses to personalise answers. Everything here is
            visible, editable and permanently deletable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">
              <Settings2 className="h-3.5 w-3.5" /> Auto-memory
            </Link>
          </Button>
          <Button variant="aurora" size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Add memory
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
            Stored memories
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">
            {total}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
            Categories
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">
            {Object.keys(counts).length}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.03] p-4">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-emerald-200/70">
            <ShieldCheck className="h-3 w-3" /> Privacy
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Wiping memory is immediate and irreversible.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search keys and values…"
            maxLength={120}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory("")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
              !category
                ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                : "border-white/[0.08] bg-white/[0.02] text-slate-500 hover:text-slate-300",
            )}
          >
            All {total}
          </button>
          {MEMORY_CATEGORIES.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(category === item ? "" : item)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] capitalize transition-colors",
                category === item
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                  : "border-white/[0.08] bg-white/[0.02] text-slate-500 hover:text-slate-300",
              )}
            >
              {item} {counts[item] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {loading ? (
          [0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-36 w-full rounded-2xl" />
          ))
        ) : memories.length ? (
          memories.map((memory) => (
            <div
              key={memory.id}
              className="group flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-white/[0.12]"
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[9px] font-medium capitalize",
                    CATEGORY_STYLES[memory.category] ??
                      CATEGORY_STYLES.fact,
                  )}
                >
                  {memory.category}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-500">
                  {memory.key}
                </span>
                <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(memory)}
                    aria-label="Edit memory"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-rose-300/70 hover:text-rose-200"
                    onClick={() => setDeleteTarget(memory)}
                    aria-label="Delete memory"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="mt-2.5 flex-1 text-[13px] leading-6 text-slate-300">
                {memory.value}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between text-[9px] text-slate-600">
                    <span>confidence</span>
                    <span>{Math.round(memory.confidence * 100)}%</span>
                  </div>
                  <Progress value={memory.confidence * 100} />
                </div>
                <span className="text-[9px] text-slate-600">
                  {memory.last_used_at
                    ? `used ${formatRelative(memory.last_used_at)}`
                    : `added ${formatRelative(memory.created_at)}`}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="md:col-span-2 rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.015] px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <Sparkles className="h-5 w-5 text-slate-500" />
            </div>
            <p className="mt-4 font-display text-base font-semibold text-white">
              {query || category ? "No matching memories" : "No memories yet"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
              {query || category
                ? "Try another search or category."
                : "AETHER will learn durable preferences as you chat — or add one manually to get started."}
            </p>
            {!query && !category ? (
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" /> Add your first memory
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {total > 0 ? (
        <div className="mt-8 flex flex-col items-start justify-between gap-3 rounded-2xl border border-rose-400/10 bg-rose-400/[0.025] p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-medium text-rose-100/90">Danger zone</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Permanently delete every memory AETHER has stored about you.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-rose-400/20 text-rose-200 hover:bg-rose-400/10"
            onClick={() => setWipeOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Wipe all memory
          </Button>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit memory" : "Add a memory"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update what AETHER should remember about you."
                : "Store a durable fact, preference or goal for future conversations."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveMemory} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="memory-category">Category</Label>
                <Select
                  id="memory-category"
                  value={form.category}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      category: event.target.value,
                    }))
                  }
                >
                  {MEMORY_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="memory-confidence">Confidence</Label>
                <Input
                  id="memory-confidence"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.confidence}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      confidence: Number(event.target.value),
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory-key">Key</Label>
              <Input
                id="memory-key"
                value={form.key}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, key: event.target.value }))
                }
                placeholder="e.g. preferred_code_language"
                maxLength={160}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory-value">Value</Label>
              <Textarea
                id="memory-value"
                value={form.value}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    value: event.target.value,
                  }))
                }
                placeholder="e.g. Prefers TypeScript with strict mode for new projects."
                maxLength={4000}
                rows={4}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" variant="aurora" disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editing ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editing ? "Save changes" : "Store memory"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forget this memory?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.value}” will be permanently deleted and will no
              longer influence future answers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => void deleteMemory()}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Forget permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wipe all memory?</DialogTitle>
            <DialogDescription>
              This permanently deletes all {total} stored memories. AETHER will
              start over with no long-term context. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWipeOpen(false)}
              disabled={wiping}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void wipeMemories()}
              disabled={wiping}
            >
              {wiping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Wipe everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
