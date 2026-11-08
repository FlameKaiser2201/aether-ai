"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bug,
  Globe2,
  GraduationCap,
  History,
  Loader2,
  Mic,
  Pin,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Composer } from "@/components/chat/composer";
import { MessageBubble } from "@/components/chat/message-bubble";
import { AetherMark } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { api, errorMessage } from "@/lib/api";
import { streamChat } from "@/lib/chat-stream";
import { CHAT_MODES, SUGGESTIONS } from "@/lib/constants";
import { speakText, stopSpeaking } from "@/lib/speech";
import { cn, formatRelative } from "@/lib/utils";
import type {
  ChatMeta,
  ChatMode,
  Conversation,
  ConversationDetail,
  ConversationList,
  FileRecord,
  Message,
  SettingsPayload,
} from "@/lib/types";

const MODE_VALUES = new Set<string>(CHAT_MODES.map((item) => item.value));
const SUGGESTION_ICONS = {
  GraduationCap,
  Bug,
  Mic,
  Globe2,
} as const;

function normalizeMode(value: string): ChatMode {
  return MODE_VALUES.has(value) ? (value as ChatMode) : "auto";
}

function localId(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${suffix}`;
}

export function ChatView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [railQuery, setRailQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [mode, setMode] = useState<ChatMode>("auto");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [demoDismissed, setDemoDismissed] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const initializedRef = useRef(false);
  const lastUrlRef = useRef<string | null>(null);

  const dictation = useSpeechRecognition({
    onFinal: (text) =>
      setInput((previous) =>
        previous ? `${previous.trimEnd()} ${text}` : text,
      ),
    onError: (message) => toast.error(message),
  });

  const loadConversations = useCallback(async () => {
    try {
      const data = await api<ConversationList>("conversations?limit=60");
      setConversations(data.items);
    } catch {
      // The rail is supplementary; the chat still works without it.
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api<SettingsPayload>("settings");
      setSettings(data);
    } catch {
      // Capability metadata is optional for chat.
    }
  }, []);

  const loadConversation = useCallback(
    async (id: string) => {
      setLoadingConversation(true);
      try {
        const detail = await api<ConversationDetail>(`conversations/${id}`);
        setActiveId(detail.id);
        setActiveTitle(detail.title);
        setMessages(detail.messages);
        setMode(normalizeMode(detail.mode));
        setAttachments([]);
        setStatus(null);
        stickToBottomRef.current = true;
      } catch (error) {
        toast.error(errorMessage(error));
        setActiveId(null);
        setActiveTitle(null);
        setMessages([]);
        router.replace("/chat", { scroll: false });
      } finally {
        setLoadingConversation(false);
      }
    },
    [router],
  );

  const resetChat = useCallback(
    (navigate = true) => {
      abortRef.current?.abort();
      abortRef.current = null;
      streamingRef.current = false;
      setStreaming(false);
      setStatus(null);
      setActiveId(null);
      setActiveTitle(null);
      setMessages([]);
      setAttachments([]);
      setInput("");
      setMode("auto");
      setSpeakingId(null);
      stopSpeaking();
      if (navigate) {
        lastUrlRef.current = null;
        router.replace("/chat", { scroll: false });
      }
    },
    [router],
  );

  useEffect(() => {
    void loadConversations();
    void loadSettings();
  }, [loadConversations, loadSettings]);

  useEffect(() => {
    if (!settings) return;
    setWebSearch(settings.preferences.web_search_default);
  }, [settings]);

  const urlId = searchParams.get("c");

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    lastUrlRef.current = urlId;
    const modeParam = searchParams.get("mode");
    if (modeParam && MODE_VALUES.has(modeParam)) setMode(modeParam as ChatMode);
    const prompt = searchParams.get("prompt");
    if (prompt) setInput(prompt);
    if (urlId) void loadConversation(urlId);
  }, [loadConversation, searchParams, urlId]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (urlId === lastUrlRef.current) return;
    lastUrlRef.current = urlId;
    if (streamingRef.current) return;
    if (urlId) void loadConversation(urlId);
    else resetChat(false);
  }, [loadConversation, resetChat, urlId]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    stickToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 140;
  }

  function openConversation(id: string) {
    if (streamingRef.current) {
      toast.error("Stop the current response before switching chats.");
      return;
    }
    if (id === activeId) return;
    lastUrlRef.current = id;
    router.replace(`/chat?c=${id}`, { scroll: false });
    void loadConversation(id);
  }

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || streamingRef.current) return;
    if (text.length > 20000) {
      toast.error("Messages are limited to 20,000 characters.");
      return;
    }

    const now = new Date().toISOString();
    const assistantLocalId = localId("assistant");
    const requestAttachments = attachments;
    const userMessage: Message = {
      id: localId("user"),
      role: "user",
      content: text,
      provider: null,
      model: null,
      citations: [],
      meta: {
        attachments: requestAttachments.map((file) => ({
          name: file.original_name,
          size: file.size_bytes,
        })),
      },
      created_at: now,
    };
    const assistantMessage: Message = {
      id: assistantLocalId,
      role: "assistant",
      content: "",
      provider: null,
      model: null,
      citations: [],
      meta: {},
      created_at: now,
      pending: true,
    };

    setMessages((previous) => [...previous, userMessage, assistantMessage]);
    setInput("");
    setAttachments([]);
    setStreaming(true);
    streamingRef.current = true;
    setStatus("Routing your request…");
    stickToBottomRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let conversationId = activeId ?? undefined;
    let metaLocal: ChatMeta | null = null;

    try {
      await streamChat(
        {
          message: text,
          conversation_id: conversationId,
          mode,
          file_ids: requestAttachments.map((file) => file.id),
          web_search: webSearch,
        },
        {
          onMeta: (meta) => {
            metaLocal = meta;
            if (!conversationId) {
              conversationId = meta.conversation_id;
              setActiveId(meta.conversation_id);
              lastUrlRef.current = meta.conversation_id;
              router.replace(`/chat?c=${meta.conversation_id}`, {
                scroll: false,
              });
            }
            void loadConversations();
          },
          onStatus: (_stage, message) => setStatus(message),
          onCitations: (citations) => {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantLocalId
                  ? { ...message, citations }
                  : message,
              ),
            );
          },
          onToken: (chunk) => {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantLocalId
                  ? { ...message, content: message.content + chunk }
                  : message,
              ),
            );
          },
          onValidation: (blocks) => {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantLocalId
                  ? { ...message, meta: { ...message.meta, validation: blocks } }
                  : message,
              ),
            );
          },
          onUsage: (usage) => {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantLocalId
                  ? { ...message, meta: { ...message.meta, usage } }
                  : message,
              ),
            );
          },
          onDone: (done) => {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantLocalId
                  ? {
                      ...message,
                      id: done.message_id || message.id,
                      pending: false,
                      provider: metaLocal?.provider ?? null,
                      model: metaLocal?.model ?? null,
                      meta: {
                        ...message.meta,
                        demo: metaLocal?.demo ?? false,
                        task_type: metaLocal?.task_type,
                        tier: metaLocal?.tier,
                        routing_reason: metaLocal?.routing_reason,
                      },
                    }
                  : message,
              ),
            );
            if (done.title) setActiveTitle(done.title);
            setStatus(null);
            void loadConversations();
          },
          onError: (error) => {
            toast.error(error.message);
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantLocalId
                  ? {
                      ...message,
                      pending: false,
                      content:
                        message.content ||
                        `I couldn't complete that response.\n\n${error.message}`,
                      meta: { ...message.meta, error: error.code },
                    }
                  : message,
              ),
            );
          },
        },
        controller.signal,
      );
    } catch (error) {
      const aborted =
        error instanceof DOMException && error.name === "AbortError";
      if (!aborted) toast.error(errorMessage(error));
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantLocalId
            ? {
                ...message,
                pending: false,
                content:
                  message.content ||
                  (aborted
                    ? "_Response stopped._"
                    : `I couldn't complete that response.\n\n${errorMessage(error)}`),
                meta: aborted
                  ? message.meta
                  : { ...message.meta, error: "network_error" },
              }
            : message,
        ),
      );
    } finally {
      setStreaming(false);
      streamingRef.current = false;
      setStatus(null);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStatus("Stopping…");
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const remaining = 8 - attachments.length;
    if (remaining <= 0) {
      toast.error("You can attach up to 8 files per message.");
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      toast.error("Only the first files that fit the 8-file limit were added.");
    }
    setUploading(true);
    for (const file of selected) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is larger than the 25 MB limit.`);
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      if (activeId) form.append("conversation_id", activeId);
      try {
        const record = await api<FileRecord>("files", {
          method: "POST",
          body: form,
        });
        setAttachments((previous) => [...previous, record]);
      } catch (error) {
        toast.error(`${file.name}: ${errorMessage(error)}`);
      }
    }
    setUploading(false);
  }

  async function removeAttachment(id: string) {
    setAttachments((previous) => previous.filter((file) => file.id !== id));
    try {
      await api(`files/${id}`, { method: "DELETE" });
    } catch {
      // The attachment is removed locally even if cleanup fails.
    }
  }

  async function handleSpeak(id: string, text: string) {
    if (speakingId === id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    const preferences = settings?.preferences;
    try {
      setSpeakingId(id);
      await speakText(text, {
        voiceName:
          preferences?.voice_name && preferences.voice_name !== "auto"
            ? preferences.voice_name
            : undefined,
        rate: preferences?.voice_rate,
        pitch: preferences?.voice_pitch,
        onEnd: () =>
          setSpeakingId((current) => (current === id ? null : current)),
      });
    } catch (error) {
      toast.error(errorMessage(error));
      setSpeakingId(null);
    }
  }

  async function dismissDemoBanner() {
    setDemoDismissed(true);
    try {
      await api("settings", {
        method: "PATCH",
        body: JSON.stringify({ demo_banner_dismissed: true }),
      });
    } catch {
      // Dismissal is best-effort.
    }
  }

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeId,
  );
  const filteredConversations = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(railQuery.trim().toLowerCase()),
  );
  const showDemo =
    Boolean(settings?.capabilities.demo_mode) &&
    !settings?.preferences.demo_banner_dismissed &&
    !demoDismissed;
  const showRouting = settings?.preferences.show_routing ?? true;

  return (
    <div className="flex h-[calc(100dvh-4rem)] overflow-hidden">
      <aside className="hidden w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-[#060912]/50 lg:flex">
        <div className="flex h-14 items-center justify-between border-b border-white/[0.06] px-4">
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Conversations
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => resetChat()}
            aria-label="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              value={railQuery}
              onChange={(event) => setRailQuery(event.target.value)}
              placeholder="Search conversations"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
          {conversationsLoading ? (
            <div className="space-y-2 px-1">
              {[0, 1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredConversations.length ? (
            <div className="space-y-1">
              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => openConversation(conversation.id)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                    activeId === conversation.id
                      ? "bg-white/[0.07]"
                      : "hover:bg-white/[0.04]",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {conversation.pinned ? (
                      <Pin className="h-3 w-3 shrink-0 text-amber-300/80" />
                    ) : null}
                    <span className="truncate text-xs font-medium text-slate-200">
                      {conversation.title}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-600">
                    <span>{conversation.message_count} messages</span>
                    <span>
                      {formatRelative(
                        conversation.last_message_at ?? conversation.updated_at,
                      )}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-8 text-center">
              <p className="text-[11px] text-slate-500">
                {railQuery
                  ? "No conversations match that search."
                  : "Your conversations will appear here."}
              </p>
            </div>
          )}
        </div>
        <div className="border-t border-white/[0.06] p-3">
          <Button asChild variant="outline" size="sm" className="w-full justify-start">
            <Link href="/history">
              <History className="h-3.5 w-3.5" /> All history
            </Link>
          </Button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-slate-200">
                {activeTitle ?? activeConversation?.title ?? "New conversation"}
              </p>
              {mode !== "auto" ? (
                <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                  {mode}
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-[10px] text-slate-600">
              {activeConversation
                ? `${activeConversation.message_count} messages · ${formatRelative(
                    activeConversation.last_message_at ??
                      activeConversation.updated_at,
                  )}`
                : "Auto-routing to the right model and mode"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-[128px]">
              <Select
                value={mode}
                onChange={(event) => setMode(event.target.value as ChatMode)}
                className="h-8 text-xs"
                aria-label="Chat mode"
              >
                {CHAT_MODES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button asChild variant="ghost" size="icon-sm" className="lg:hidden">
              <Link href="/history" aria-label="Conversation history">
                <History className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetChat()}
              className="hidden sm:inline-flex"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </Button>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto scrollbar-thin"
        >
          {loadingConversation ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                Loading conversation…
              </div>
            </div>
          ) : messages.length ? (
            <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  status={message.pending ? status : null}
                  showRouting={showRouting}
                  speaking={speakingId === message.id}
                  onSpeak={(text) => void handleSpeak(message.id, text)}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="flex min-h-full flex-col items-center justify-center px-5 py-10">
              <AetherMark className="h-14 w-14 rounded-2xl" />
              <h1 className="mt-5 text-center font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                What are we working on?
              </h1>
              <p className="mt-2 max-w-md text-center text-sm leading-6 text-slate-500">
                Ask a question, attach a document, or start a focused session.
                AETHER will route to the right model and remember what matters.
              </p>
              <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => {
                  const Icon =
                    SUGGESTION_ICONS[
                      suggestion.icon as keyof typeof SUGGESTION_ICONS
                    ] ?? Sparkles;
                  return (
                    <button
                      key={suggestion.title}
                      onClick={() => void send(suggestion.prompt)}
                      className="group flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-400/20 hover:bg-white/[0.04]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-200">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-xs font-medium text-slate-200">
                          {suggestion.title}
                        </span>
                        <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                          {suggestion.body}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.16em] text-slate-600">
                  Start in
                </span>
                {CHAT_MODES.filter((item) => item.value !== "auto").map(
                  (item) => (
                    <button
                      key={item.value}
                      onClick={() => setMode(item.value)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                        mode === item.value
                          ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                          : "border-white/[0.08] bg-white/[0.02] text-slate-500 hover:text-slate-300",
                      )}
                      title={item.hint}
                    >
                      {item.label}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0">
          {showDemo ? (
            <div className="mx-auto flex w-full max-w-3xl items-start gap-2 px-3 pt-2 sm:px-6">
              <div className="flex flex-1 items-start gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-[10px] leading-4 text-amber-100/80">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Demo mode is on — responses are illustrative until a provider
                  key is configured.{" "}
                  <Link href="/settings" className="underline hover:text-amber-50">
                    Add a model
                  </Link>
                </span>
              </div>
              <button
                onClick={() => void dismissDemoBanner()}
                className="mt-1 rounded-md p-1 text-amber-200/50 transition-colors hover:bg-white/5 hover:text-amber-100"
                aria-label="Dismiss demo banner"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}

          <Composer
            value={input}
            onChange={setInput}
            onSend={() => void send()}
            streaming={streaming}
            onStop={stop}
            attachments={attachments}
            onRemoveAttachment={(id) => void removeAttachment(id)}
            onFiles={(files) => void handleFiles(files)}
            uploading={uploading}
            webSearch={webSearch}
            onWebSearchChange={setWebSearch}
            listening={dictation.listening}
            onToggleDictation={() =>
              dictation.listening ? dictation.stop() : dictation.start()
            }
            dictationSupported={dictation.supported}
            interim={dictation.interim}
          />
        </div>
      </section>
    </div>
  );
}
