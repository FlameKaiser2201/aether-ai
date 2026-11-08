"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Flag,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/studio/confirm-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { Task } from "@/lib/types";

type TaskStatus = Task["status"];
type Filter = "all" | TaskStatus;

const STATUS_ORDER: Record<TaskStatus, number> = {
  pending: 0,
  in_progress: 1,
  done: 2,
  cancelled: 3,
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

const PRIORITIES = [
  { value: 1, label: "P1 · Critical" },
  { value: 2, label: "P2 · High" },
  { value: 3, label: "P3 · Medium" },
  { value: 4, label: "P4 · Low" },
  { value: 5, label: "P5 · Someday" },
] as const;

function priorityLabel(priority: number): string {
  return (
    PRIORITIES.find((item) => item.value === priority)?.label ?? `P${priority}`
  );
}

function priorityVariant(
  priority: number,
): "destructive" | "warning" | "secondary" | "outline" {
  if (priority <= 2) return "destructive";
  if (priority === 3) return "warning";
  if (priority === 4) return "secondary";
  return "outline";
}

function isOverdue(task: Task): boolean {
  return Boolean(
    task.due_at &&
      !["done", "cancelled"].includes(task.status) &&
      new Date(task.due_at).getTime() < Date.now(),
  );
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [dueAt, setDueAt] = useState("");
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState(3);
  const [editDueAt, setEditDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const data = await api<Task[]>("tasks");
      setTasks(data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const counts = useMemo(() => {
    const base: Record<TaskStatus, number> = {
      pending: 0,
      in_progress: 0,
      done: 0,
      cancelled: 0,
    };
    for (const task of tasks) base[task.status] += 1;
    return base;
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const filtered =
      filter === "all" ? tasks : tasks.filter((task) => task.status === filter);
    return [...filtered].sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.due_at && b.due_at) {
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      }
      return a.due_at ? -1 : b.due_at ? 1 : 0;
    });
  }, [filter, tasks]);

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Give the task a title.");
      return;
    }
    setCreating(true);
    try {
      const task = await api<Task>("tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      setTasks((previous) => [task, ...previous]);
      setTitle("");
      setDescription("");
      setPriority(3);
      setDueAt("");
      toast.success("Task added");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(task: Task, status: TaskStatus) {
    setBusyId(task.id);
    try {
      const updated = await api<Task>(`tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setTasks((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDone(task: Task) {
    await updateStatus(task, task.status === "done" ? "pending" : "done");
  }

  function openEditor(task: Task) {
    setEditing(task);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditPriority(task.priority);
    setEditDueAt(toLocalInput(task.due_at));
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editTitle.trim()) {
      toast.error("The title cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api<Task>(`tasks/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          priority: editPriority,
          due_at: editDueAt ? new Date(editDueAt).toISOString() : null,
        }),
      });
      setTasks((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditing(null);
      toast.success("Task updated");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeTask() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`tasks/${deleteTarget.id}`, { method: "DELETE" });
      setTasks((previous) =>
        previous.filter((task) => task.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
      toast.success("Task deleted");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  const filters: Array<{ value: Filter; label: string; count: number }> = [
    { value: "all", label: "All", count: tasks.length },
    { value: "pending", label: "Pending", count: counts.pending },
    { value: "in_progress", label: "Active", count: counts.in_progress },
    { value: "done", label: "Done", count: counts.done },
    { value: "cancelled", label: "Cancelled", count: counts.cancelled },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.8fr)_1.2fr]">
      <div className="space-y-4">
        <form
          onSubmit={createTask}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-200">
              <ListChecks className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Task studio
              </h2>
              <p className="text-[10px] text-slate-500">
                Capture work, rank it and keep momentum.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Task</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Finish the database normalization notes"
                maxLength={240}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-description">
                Details <span className="text-slate-600">(optional)</span>
              </Label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Definition of done, links or context."
                rows={3}
                maxLength={5000}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-priority">Priority</Label>
                <Select
                  id="task-priority"
                  value={String(priority)}
                  onChange={(event) => setPriority(Number(event.target.value))}
                >
                  {PRIORITIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-due">Due</Label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="aurora"
              className="w-full"
              disabled={creating}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {creating ? "Adding task…" : "Add task"}
            </Button>
          </div>
        </form>

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Pending", value: counts.pending, tone: "text-amber-300" },
            {
              label: "In progress",
              value: counts.in_progress,
              tone: "text-cyan-300",
            },
            { label: "Done", value: counts.done, tone: "text-emerald-300" },
            {
              label: "Overdue",
              value: tasks.filter(isOverdue).length,
              tone: "text-rose-300",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
            >
              <p className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                {stat.label}
              </p>
              <p
                className={cn(
                  "mt-0.5 font-display text-lg font-semibold",
                  stat.tone,
                )}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm font-semibold text-white">
              Your tasks
            </h2>
            <p className="text-[10px] text-slate-500">
              Highest priority and nearest deadline first.
            </p>
          </div>
          <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
            {visibleTasks.length} shown
          </Badge>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-4 py-2 scrollbar-none sm:px-5">
          {filters.map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10.5px] transition-colors",
                filter === item.value
                  ? "bg-white/[0.08] text-white"
                  : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300",
              )}
            >
              {item.label}
              <span className="font-mono text-[9px] text-slate-600">
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-2 p-4 sm:p-5">
          {loading ? (
            [0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-20 w-full rounded-xl" />
            ))
          ) : visibleTasks.length ? (
            visibleTasks.map((task) => {
              const done = task.status === "done";
              const overdue = isOverdue(task);
              return (
                <div
                  key={task.id}
                  className={cn(
                    "group rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition-colors hover:border-white/[0.12]",
                    done && "opacity-65",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      onClick={() => void toggleDone(task)}
                      disabled={busyId === task.id}
                      className="mt-0.5 shrink-0 text-slate-600 transition-colors hover:text-emerald-300"
                      aria-label={done ? "Mark as pending" : "Mark as done"}
                    >
                      {busyId === task.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p
                          className={cn(
                            "text-[12px] font-medium text-slate-200",
                            done && "line-through",
                          )}
                        >
                          {task.title}
                        </p>
                        <Badge
                          variant={priorityVariant(task.priority)}
                          className="px-1.5 py-0 text-[8.5px]"
                        >
                          <Flag className="h-2 w-2" />
                          {priorityLabel(task.priority)}
                        </Badge>
                        {overdue ? (
                          <Badge
                            variant="destructive"
                            className="px-1.5 py-0 text-[8.5px]"
                          >
                            overdue
                          </Badge>
                        ) : null}
                      </div>
                      {task.description ? (
                        <p className="mt-1 line-clamp-2 text-[10.5px] leading-5 text-slate-500">
                          {task.description}
                        </p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[9px] text-slate-600">
                        {task.due_at ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              overdue && "text-rose-300/80",
                            )}
                          >
                            <CalendarClock className="h-2.5 w-2.5" />
                            {formatDate(task.due_at)}
                          </span>
                        ) : (
                          <span>No deadline</span>
                        )}
                        <span>{STATUS_LABELS[task.status]}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Select
                        value={task.status}
                        onChange={(event) =>
                          void updateStatus(
                            task,
                            event.target.value as TaskStatus,
                          )
                        }
                        className="h-7 w-[112px] rounded-lg px-2 py-0 pr-7 text-[9.5px]"
                        aria-label="Task status"
                      >
                        {(
                          Object.keys(STATUS_LABELS) as TaskStatus[]
                        ).map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </Select>
                      <button
                        onClick={() => openEditor(task)}
                        className="rounded p-1 text-slate-600 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
                        aria-label="Edit task"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(task)}
                        className="rounded p-1 text-slate-600 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                        aria-label="Delete task"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
              <ListChecks className="h-6 w-6 text-slate-600" />
              <p className="mt-2 text-[11.5px] font-medium text-slate-300">
                {filter === "all" ? "No tasks yet" : "Nothing in this view"}
              </p>
              <p className="mt-1 max-w-xs text-[10px] leading-5 text-slate-600">
                Add a task on the left, then rank it by priority and deadline.
                AETHER keeps the list ordered so the next action is obvious.
              </p>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
            <DialogDescription>
              Change the wording, priority or deadline. Status is managed from
              the task list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-title">Task</Label>
              <Input
                id="edit-task-title"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                maxLength={240}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-description">Details</Label>
              <Textarea
                id="edit-task-description"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                rows={3}
                maxLength={5000}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-task-priority">Priority</Label>
                <Select
                  id="edit-task-priority"
                  value={String(editPriority)}
                  onChange={(event) =>
                    setEditPriority(Number(event.target.value))
                  }
                >
                  {PRIORITIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-task-due">Due</Label>
                <Input
                  id="edit-task-due"
                  type="datetime-local"
                  value={editDueAt}
                  onChange={(event) => setEditDueAt(event.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="aurora"
              onClick={() => void saveEdit()}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete this task?"
        description="The task and its details will be permanently removed."
        busy={deleting}
        onConfirm={() => void removeTask()}
      />
    </div>
  );
}
