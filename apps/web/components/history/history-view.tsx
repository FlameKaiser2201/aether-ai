"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Clock,
  Download,
  FileJson,
  FileText,
  History,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDate, formatRelative, truncate } from "@/lib/utils";
import type { Conversation, ConversationList } from "@/lib/types";

function modeLabel(mode: string): string {
  if (mode === "chat") return "general";
  return mode.replace("_", " ");
}

export function HistoryView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(
      async () => {
        const params = new URLSearchParams({
          limit: "100",
          archived: String(archived),
        });
        if (query.trim()) params.set("query", query.trim());
        try {
          const data = await api<ConversationList>(
            `conversations?${params.toString()}`,
          );
          if (!cancelled) setConversations(data.items);
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
  }, [archived, query]);

  async function updateConversation(
    conversation: Conversation,
    patch: { pinned?: boolean; archived?: boolean },
  ) {
    setBusyId(conversation.id);
    try {
      const updated = await api<Conversation>(
        `conversations/${conversation.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );
      setConversations((previous) => {
        if (patch.archived !== undefined) {
          return previous.filter((item) => item.id !== conversation.id);
        }
        return previous.map((item) =>
          item.id === conversation.id ? updated : item,
        );
      });
      if (patch.archived) toast.success("Conversation archived");
      else if (patch.pinned !== undefined)
        toast.success(patch.pinned ? "Pinned to the top" : "Unpinned");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteConversation() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`conversations/${deleteTarget.id}`, { method: "DELETE" });
      setConversations((previous) =>
        previous.filter((item) => item.id !== deleteTarget.id),
      );
      toast.success("Conversation deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  async function exportConversation(conversation: Conversation, format: "md" | "json") {
    setBusyId(conversation.id);
    try {
      const response = await fetch(
        `/api/proxy/conversations/${conversation.id}/export?format=${format}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const fallback = `${conversation.title.replace(/[^\w\-. ]+/g, "_")}.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = match?.[1] ?? fallback;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <History className="h-3.5 w-3.5 text-cyan-300/80" /> Workspace
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Conversation history
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-500">
            Every chat, voice session and research thread — searchable,
            exportable and yours to delete.
          </p>
        </div>
        <Button asChild variant="aurora" size="sm">
          <Link href="/chat">
            <MessageSquare className="h-3.5 w-3.5" /> New conversation
          </Link>
        </Button>
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles and summaries…"
            maxLength={120}
            className="pl-9"
          />
        </div>
        <div className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.025] p-1">
          <button
            onClick={() => setArchived(false)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs transition-colors",
              !archived
                ? "bg-white/[0.08] text-white"
                : "text-muted-foreground hover:text-slate-200",
            )}
          >
            Active
          </button>
          <button
            onClick={() => setArchived(true)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs transition-colors",
              archived
                ? "bg-white/[0.08] text-white"
                : "text-muted-foreground hover:text-slate-200",
            )}
          >
            Archived
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {loading ? (
          [0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-[88px] w-full rounded-2xl" />
          ))
        ) : conversations.length ? (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className="group flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-white/[0.12] hover:bg-white/[0.035]"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-cyan-200/80">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/chat?c=${conversation.id}`}
                    className="truncate text-sm font-medium text-slate-200 transition-colors hover:text-white"
                  >
                    {conversation.title}
                  </Link>
                  {conversation.pinned ? (
                    <Badge variant="warning" className="px-1.5 py-0 text-[9px]">
                      <Pin className="h-2.5 w-2.5" /> pinned
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                    {modeLabel(conversation.mode)}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] leading-5 text-slate-500">
                  {conversation.summary
                    ? truncate(conversation.summary, 180)
                    : `${conversation.message_count} messages · created ${formatDate(
                        conversation.created_at,
                      )}`}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelative(
                      conversation.last_message_at ?? conversation.updated_at,
                    )}
                  </span>
                  <span>{conversation.message_count} messages</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  asChild
                  variant="ghost"
                  size="icon-sm"
                  className="hidden sm:inline-flex"
                >
                  <Link
                    href={`/chat?c=${conversation.id}`}
                    aria-label="Open conversation"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busyId === conversation.id}
                      aria-label="Conversation actions"
                    >
                      {busyId === conversation.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link href={`/chat?c=${conversation.id}`}>
                        <MessageSquare className="h-4 w-4" /> Open
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        void updateConversation(conversation, {
                          pinned: !conversation.pinned,
                        })
                      }
                    >
                      {conversation.pinned ? (
                        <>
                          <PinOff className="h-4 w-4" /> Unpin
                        </>
                      ) : (
                        <>
                          <Pin className="h-4 w-4" /> Pin
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        void exportConversation(conversation, "md")
                      }
                    >
                      <FileText className="h-4 w-4" /> Export Markdown
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        void exportConversation(conversation, "json")
                      }
                    >
                      <FileJson className="h-4 w-4" /> Export JSON
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() =>
                        void updateConversation(conversation, {
                          archived: !conversation.archived,
                        })
                      }
                    >
                      <Archive className="h-4 w-4" />
                      {conversation.archived ? "Restore" : "Archive"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-rose-200 focus:bg-rose-500/10"
                      onSelect={() => setDeleteTarget(conversation)}
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.015] px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <Download className="h-5 w-5 text-slate-500" />
            </div>
            <p className="mt-4 font-display text-base font-semibold text-white">
              {query
                ? "No conversations match that search"
                : archived
                  ? "Nothing archived"
                  : "No conversations yet"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
              {query
                ? "Try a different title or clear the search."
                : archived
                  ? "Archived conversations stay out of your main list but remain exportable."
                  : "Start a chat or a voice session and it will appear here automatically."}
            </p>
            {!query && !archived ? (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/chat">Start a conversation</Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this conversation?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.title}” and all of its messages will be permanently
              removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void deleteConversation()}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
