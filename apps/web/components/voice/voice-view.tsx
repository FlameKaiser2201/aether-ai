"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  AudioLines,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { toast } from "sonner";

import { MessageBubble } from "@/components/chat/message-bubble";
import { AetherMark } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { api, errorMessage } from "@/lib/api";
import { streamChat } from "@/lib/chat-stream";
import {
  browserSupportsSpeech,
  getSpeechRecognition,
  SentenceBuffer,
  speakText,
  stopSpeaking,
  stripMarkdownForSpeech,
} from "@/lib/speech";
import { cn } from "@/lib/utils";
import type {
  ChatMeta,
  Message,
  SettingsPayload,
  UserPreferences,
  VoiceStatus,
} from "@/lib/types";

function localId(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${suffix}`;
}

const EXAMPLES = [
  "Explain how database indexes work like I'm preparing for a backend interview.",
  "Quiz me on three SQL joins, one question at a time.",
  "Summarize the key ideas behind transformer models in plain language.",
];

type VoiceState =
  | "idle"
  | "listening"
  | "recording"
  | "transcribing"
  | "thinking"
  | "speaking";

export function VoiceView() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typed, setTyped] = useState("");
  const [thinking, setThinking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const thinkingRef = useRef(false);
  const continuousRef = useRef(false);
  const autoSpeakRef = useRef(true);
  const conversationIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speechGenerationRef = useRef(0);
  const pendingSpeechRef = useRef(0);
  const speechChainRef = useRef<Promise<void>>(Promise.resolve());
  const sentenceBufferRef = useRef(new SentenceBuffer());
  const voiceStatusRef = useRef<VoiceStatus | null>(null);
  const preferencesRef = useRef<UserPreferences | null>(null);
  const prefsAppliedRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const dictation = useSpeechRecognition({
    onFinal: (text) => {
      void handleUtterance(text);
    },
    onEnd: () => {
      if (continuousRef.current && !thinkingRef.current) {
        window.setTimeout(() => {
          if (continuousRef.current && !thinkingRef.current) dictation.start();
        }, 300);
      }
    },
    onError: (message) => {
      setError(message);
      toast.error(message);
    },
  });

  useEffect(() => {
    thinkingRef.current = thinking;
  }, [thinking]);
  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);
  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [settingsPayload, statusPayload] = await Promise.all([
          api<SettingsPayload>("settings"),
          api<VoiceStatus>("voice/status"),
        ]);
        if (cancelled) return;
        setSettings(settingsPayload);
        setVoiceStatus(statusPayload);
        voiceStatusRef.current = statusPayload;
        preferencesRef.current = settingsPayload.preferences;
        if (!prefsAppliedRef.current) {
          prefsAppliedRef.current = true;
          const canListenContinuously =
            Boolean(getSpeechRecognition()) &&
            settingsPayload.preferences.continuous_listening;
          setContinuous(canListenContinuously);
          continuousRef.current = canListenContinuously;
          setAutoSpeak(settingsPayload.preferences.auto_speak);
          autoSpeakRef.current = settingsPayload.preferences.auto_speak;
        }
      } catch {
        // Voice still works with browser defaults if settings are unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, statusMessage]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      speechGenerationRef.current += 1;
      stopSpeaking();
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = null;
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // already stopped
        }
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function speakSentence(text: string): Promise<void> {
    const clean = stripMarkdownForSpeech(text).trim();
    if (!clean) return;
    const preferences = preferencesRef.current;
    if (browserSupportsSpeech()) {
      await speakText(clean, {
        voiceName:
          preferences?.voice_name && preferences.voice_name !== "auto"
            ? preferences.voice_name
            : undefined,
        rate: preferences?.voice_rate ?? 1,
        pitch: preferences?.voice_pitch ?? 1,
      });
      return;
    }
    if (!voiceStatusRef.current?.tts) {
      throw new Error("Text-to-speech is not available in this browser.");
    }
    const response = await fetch("/api/proxy/voice/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: clean.slice(0, 4000),
        voice:
          preferences?.voice_name && preferences.voice_name !== "auto"
            ? preferences.voice_name
            : undefined,
        format: "mp3",
      }),
    });
    if (!response.ok) throw new Error("The speech provider could not synthesize audio.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    try {
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback failed."));
        void audio.play().catch(reject);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function restartIfContinuous() {
    if (!continuousRef.current) return;
    if (thinkingRef.current || pendingSpeechRef.current > 0) return;
    window.setTimeout(() => {
      if (
        continuousRef.current &&
        !thinkingRef.current &&
        pendingSpeechRef.current === 0
      ) {
        dictation.start();
      }
    }, 400);
  }

  function enqueueSpeech(text: string) {
    if (!autoSpeakRef.current) return;
    const clean = stripMarkdownForSpeech(text).trim();
    if (!clean) return;
    const generation = speechGenerationRef.current;
    pendingSpeechRef.current += 1;
    setSpeaking(true);
    speechChainRef.current = speechChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (generation !== speechGenerationRef.current) return;
        await speakSentence(clean);
      })
      .catch(() => undefined)
      .finally(() => {
        pendingSpeechRef.current = Math.max(0, pendingSpeechRef.current - 1);
        if (pendingSpeechRef.current === 0) {
          setSpeaking(false);
          restartIfContinuous();
        }
      });
  }

  function interrupt() {
    abortRef.current?.abort();
    abortRef.current = null;
    thinkingRef.current = false;
    setThinking(false);
    sentenceBufferRef.current = new SentenceBuffer();
    speechGenerationRef.current += 1;
    stopSpeaking();
    pendingSpeechRef.current = 0;
    setSpeaking(false);
    setStatusMessage(null);
  }

  async function handleUtterance(raw: string) {
    const text = raw.trim();
    if (!text) return;
    if (thinkingRef.current) interrupt();
    dictation.stop();
    setError(null);
    setStatusMessage("Thinking…");

    const now = new Date().toISOString();
    const assistantLocalId = localId("voice-assistant");
    const userMessage: Message = {
      id: localId("voice-user"),
      role: "user",
      content: text,
      provider: null,
      model: null,
      citations: [],
      meta: {},
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
    sentenceBufferRef.current = new SentenceBuffer();
    setThinking(true);
    thinkingRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let metaLocal: ChatMeta | null = null;

    try {
      await streamChat(
        {
          message: text,
          conversation_id: conversationIdRef.current ?? undefined,
          mode: "voice",
          voice: true,
          web_search: settings?.preferences.web_search_default ? true : undefined,
        },
        {
          onMeta: (meta) => {
            metaLocal = meta;
            if (!conversationIdRef.current) {
              conversationIdRef.current = meta.conversation_id;
              setConversationId(meta.conversation_id);
            }
          },
          onStatus: (_stage, message) => setStatusMessage(message),
          onToken: (chunk) => {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantLocalId
                  ? { ...message, content: message.content + chunk }
                  : message,
              ),
            );
            if (autoSpeakRef.current) {
              const sentences = sentenceBufferRef.current.push(chunk);
              sentences.forEach(enqueueSpeech);
            }
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
                      },
                    }
                  : message,
              ),
            );
            if (autoSpeakRef.current) {
              const rest = sentenceBufferRef.current.flush();
              if (rest) enqueueSpeech(rest);
            }
            setStatusMessage(null);
          },
          onError: (streamError) => {
            setError(streamError.message);
            toast.error(streamError.message);
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantLocalId
                  ? {
                      ...message,
                      pending: false,
                      content:
                        message.content ||
                        `I couldn't complete that response. ${streamError.message}`,
                      meta: { ...message.meta, error: streamError.code },
                    }
                  : message,
              ),
            );
          },
        },
        controller.signal,
      );
    } catch (streamError) {
      const aborted =
        streamError instanceof DOMException && streamError.name === "AbortError";
      if (!aborted) {
        const message = errorMessage(streamError);
        setError(message);
        toast.error(message);
      }
      setMessages((previous) =>
        previous.map((item) =>
          item.id === assistantLocalId
            ? {
                ...item,
                pending: false,
                content:
                  item.content ||
                  (aborted ? "_Response stopped._" : "I couldn't complete that response."),
                meta: aborted ? item.meta : { ...item.meta, error: "network_error" },
              }
            : item,
        ),
      );
    } finally {
      setThinking(false);
      thinkingRef.current = false;
      setStatusMessage(null);
      abortRef.current = null;
      const rest = sentenceBufferRef.current.flush();
      if (rest && autoSpeakRef.current) enqueueSpeech(rest);
      restartIfContinuous();
    }
  }

  function startListening() {
    setError(null);
    if (thinkingRef.current) interrupt();
    if (pendingSpeechRef.current > 0 || speaking) {
      speechGenerationRef.current += 1;
      stopSpeaking();
      pendingSpeechRef.current = 0;
      setSpeaking(false);
    }
    dictation.start();
  }

  function toggleContinuous(value: boolean) {
    if (value && !dictation.supported) {
      toast.error(
        "Continuous listening needs browser speech recognition. You can still type or record a voice note.",
      );
      return;
    }
    setContinuous(value);
    continuousRef.current = value;
    if (value) {
      if (!thinkingRef.current && pendingSpeechRef.current === 0) startListening();
    } else {
      dictation.stop();
    }
  }

  function toggleAutoSpeak(value: boolean) {
    setAutoSpeak(value);
    autoSpeakRef.current = value;
    if (!value) {
      speechGenerationRef.current += 1;
      stopSpeaking();
      pendingSpeechRef.current = 0;
      setSpeaking(false);
    }
  }

  async function startRecording() {
    if (recording) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      setError("Audio recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishRecording();
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setError(null);
    } catch {
      setError("Microphone permission was denied. Enable it in your browser settings.");
      toast.error("Microphone permission was denied.");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  async function finishRecording() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    if (blob.size < 1000) return;
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "voice.webm");
      const result = await api<{ text: string }>("voice/transcribe", {
        method: "POST",
        body: form,
      });
      if (result.text?.trim()) void handleUtterance(result.text);
      else setError("No speech was detected in that recording.");
    } catch (transcriptionError) {
      toast.error(errorMessage(transcriptionError));
    } finally {
      setTranscribing(false);
    }
  }

  function onPrimaryAction() {
    if (transcribing) return;
    if (thinking) {
      interrupt();
      return;
    }
    if (speaking) {
      speechGenerationRef.current += 1;
      stopSpeaking();
      pendingSpeechRef.current = 0;
      setSpeaking(false);
      return;
    }
    if (recording) {
      stopRecording();
      return;
    }
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    if (dictation.supported) {
      startListening();
      return;
    }
    if (voiceStatus?.stt) {
      void startRecording();
      return;
    }
    setError(
      "Voice input needs browser speech recognition or a configured STT provider. You can type below instead.",
    );
  }

  async function replayLast() {
    const last = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.content.trim());
    if (!last) {
      toast.error("There is no answer to replay yet.");
      return;
    }
    if (speaking) {
      speechGenerationRef.current += 1;
      stopSpeaking();
      pendingSpeechRef.current = 0;
      setSpeaking(false);
      return;
    }
    const generation = speechGenerationRef.current;
    pendingSpeechRef.current = 1;
    setSpeaking(true);
    try {
      if (generation === speechGenerationRef.current) {
        await speakSentence(last.content);
      }
    } catch (replayError) {
      toast.error(errorMessage(replayError));
    } finally {
      pendingSpeechRef.current = 0;
      setSpeaking(false);
    }
  }

  function newSession() {
    interrupt();
    dictation.stop();
    setMessages([]);
    setConversationId(null);
    conversationIdRef.current = null;
    setTyped("");
    setError(null);
    setStatusMessage(null);
    if (continuousRef.current) {
      window.setTimeout(() => {
        if (continuousRef.current) dictation.start();
      }, 300);
    }
  }

  function submitTyped(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = typed.trim();
    if (!text || thinking) return;
    setTyped("");
    void handleUtterance(text);
  }

  const state: VoiceState = recording
    ? "recording"
    : transcribing
      ? "transcribing"
      : thinking
        ? "thinking"
        : speaking
          ? "speaking"
          : dictation.listening
            ? "listening"
            : "idle";

  const stateCopy: Record<VoiceState, { title: string; subtitle: string }> = {
    idle: {
      title: "Ready when you are",
      subtitle: dictation.supported || voiceStatus?.stt
        ? "Tap the mic and speak naturally."
        : "Type below — voice input needs a configured provider.",
    },
    listening: {
      title: "Listening…",
      subtitle: "Speak freely. Pause briefly and AETHER will respond.",
    },
    recording: {
      title: "Recording…",
      subtitle: "Tap the button again to stop and transcribe.",
    },
    transcribing: {
      title: "Transcribing…",
      subtitle: "Turning your voice note into text.",
    },
    thinking: {
      title: "Thinking…",
      subtitle: statusMessage ?? "Routing your request.",
    },
    speaking: {
      title: "Speaking…",
      subtitle: "Tap the mic to interrupt and talk over me.",
    },
  };

  const voiceBadges = [
    voiceStatus?.stt_provider
      ? `STT · ${voiceStatus.stt_provider}`
      : dictation.supported
        ? "STT · browser"
        : voiceStatus?.stt
          ? "STT · server"
          : "STT · unavailable",
    voiceStatus?.tts_provider
      ? `TTS · ${voiceStatus.tts_provider}`
      : browserSupportsSpeech()
        ? "TTS · browser"
        : voiceStatus?.tts
          ? "TTS · server"
          : "TTS · unavailable",
  ];

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-6">
        <div>
          <h1 className="font-display text-lg font-semibold tracking-tight text-white">
            Voice assistant
          </h1>
          <p className="text-[10px] text-slate-500">
            Hands-free conversation with streaming speech and memory.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {voiceBadges.map((badge) => (
            <Badge key={badge} variant="outline" className="px-2 py-0.5 text-[9px]">
              {badge}
            </Badge>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={newSession}
            className="ml-1"
          >
            <RotateCcw className="h-3.5 w-3.5" /> New session
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[0.9fr_1.1fr] lg:overflow-hidden lg:p-6">
        <section className="flex flex-col items-center justify-center rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.035] to-transparent p-5 sm:p-7">
          <div className="relative flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52">
            {state === "listening" || state === "recording" ? (
              <>
                <span className="absolute inset-2 animate-pulse-ring rounded-full border border-cyan-400/30" />
                <span
                  className="absolute inset-2 animate-pulse-ring rounded-full border border-cyan-400/20"
                  style={{ animationDelay: "0.8s" }}
                />
              </>
            ) : null}
            <span
              className={cn(
                "absolute inset-6 rounded-full border transition-colors duration-500",
                state === "speaking"
                  ? "border-violet-400/30"
                  : state === "thinking"
                    ? "border-amber-300/25"
                    : "border-white/[0.08]",
              )}
            />
            <div
              className={cn(
                "relative flex h-28 w-28 items-center justify-center rounded-full border shadow-2xl transition-all duration-500 sm:h-32 sm:w-32",
                state === "listening" || state === "recording"
                  ? "border-cyan-300/40 bg-gradient-to-br from-cyan-400/30 via-sky-500/20 to-violet-500/20 shadow-glow"
                  : state === "thinking"
                    ? "border-amber-300/30 bg-gradient-to-br from-amber-300/20 via-orange-400/10 to-violet-500/20"
                    : state === "speaking"
                      ? "border-violet-300/40 bg-gradient-to-br from-violet-400/30 via-fuchsia-500/20 to-cyan-400/20 shadow-glow-violet"
                      : "border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02]",
              )}
            >
              {state === "thinking" || state === "transcribing" ? (
                <Loader2 className="h-10 w-10 animate-spin text-amber-200" />
              ) : state === "speaking" ? (
                <Volume2 className="h-10 w-10 text-violet-200" />
              ) : state === "listening" || state === "recording" ? (
                <AudioLines className="h-10 w-10 animate-pulse text-cyan-200" />
              ) : (
                <AetherMark className="h-12 w-12 rounded-2xl" />
              )}
            </div>
          </div>

          <h2 className="mt-4 text-center font-display text-xl font-semibold tracking-tight text-white">
            {stateCopy[state].title}
          </h2>
          <p className="mt-1 min-h-[20px] max-w-xs text-center text-xs leading-5 text-slate-400">
            {stateCopy[state].subtitle}
          </p>

          {dictation.interim ? (
            <p className="mt-2 max-w-sm rounded-lg border border-cyan-400/10 bg-cyan-400/[0.04] px-3 py-1.5 text-center text-[11px] italic text-cyan-200/80">
              {dictation.interim}
            </p>
          ) : null}

          <Button
            onClick={onPrimaryAction}
            variant={state === "thinking" ? "outline" : "aurora"}
            size="lg"
            className="mt-5 min-w-[190px] rounded-full"
          >
            {state === "thinking" ? (
              <>
                <Square className="h-4 w-4 fill-current" /> Interrupt
              </>
            ) : state === "speaking" ? (
              <>
                <VolumeX className="h-4 w-4" /> Stop speaking
              </>
            ) : state === "listening" ? (
              <>
                <Square className="h-4 w-4 fill-current" /> Stop listening
              </>
            ) : state === "recording" ? (
              <>
                <Square className="h-4 w-4 fill-current" /> Stop &amp; transcribe
              </>
            ) : state === "transcribing" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Transcribing…
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" /> Start talking
              </>
            )}
          </Button>

          <div className="mt-5 grid w-full max-w-sm grid-cols-2 gap-2">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
              <Label htmlFor="continuous" className="text-[10px] normal-case tracking-normal">
                Continuous
              </Label>
              <Switch
                id="continuous"
                checked={continuous}
                onCheckedChange={toggleContinuous}
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
              <Label htmlFor="auto-speak" className="text-[10px] normal-case tracking-normal">
                Auto-speak
              </Label>
              <Switch
                id="auto-speak"
                checked={autoSpeak}
                onCheckedChange={toggleAutoSpeak}
              />
            </div>
          </div>

          <form onSubmit={submitTyped} className="mt-3 flex w-full max-w-sm gap-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Type instead…"
              disabled={thinking || transcribing}
              className="h-9 text-xs"
            />
            <Button
              type="submit"
              size="icon"
              variant="outline"
              disabled={!typed.trim() || thinking || transcribing}
              aria-label="Send typed message"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => void replayLast()}
              className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 transition-colors hover:text-slate-300"
            >
              <Volume2 className="h-3 w-3" /> Replay last answer
            </button>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 transition-colors hover:text-slate-300"
            >
              <Settings2 className="h-3 w-3" /> Voice settings
            </Link>
          </div>

          {error ? (
            <p className="mt-3 max-w-sm text-center text-[10px] leading-4 text-rose-300/80">
              {error}
            </p>
          ) : null}

          <p className="mt-3 max-w-sm text-center text-[9px] leading-4 text-slate-600">
            Audio is only captured while the mic is active. Browser speech
            recognition may use your browser vendor&apos;s service.
          </p>
        </section>

        <section className="flex min-h-[420px] flex-col rounded-3xl border border-white/[0.07] bg-white/[0.02] lg:min-h-0">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <Waves className="h-4 w-4 text-cyan-300/80" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
              Live transcript
            </span>
            {conversationId ? (
              <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                saved
              </Badge>
            ) : null}
            <span className="ml-auto text-[10px] text-slate-600">
              {messages.filter((message) => message.role === "user").length} turns
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-5">
            {messages.length ? (
              <div className="space-y-5">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    status={message.pending ? statusMessage : null}
                    showRouting={false}
                  />
                ))}
                <div ref={transcriptEndRef} />
              </div>
            ) : (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  <Sparkles className="h-5 w-5 text-cyan-200" />
                </div>
                <p className="mt-4 font-display text-base font-semibold text-white">
                  Start a conversation
                </p>
                <p className="mt-1 max-w-xs text-[11px] leading-5 text-slate-500">
                  The transcript appears here and is saved to your history when
                  the conversation begins.
                </p>
                <div className="mt-5 w-full max-w-sm space-y-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      onClick={() => void handleUtterance(example)}
                      className="w-full rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-left text-[11px] leading-5 text-slate-400 transition-colors hover:border-cyan-400/20 hover:text-slate-200"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-white/[0.06] px-4 py-2.5 text-[9px] text-slate-600">
            <Send className="h-3 w-3" />
            Voice answers are kept concise. Switch to Chat for longer documents.
            {conversationId ? (
              <Link
                href={`/chat?c=${conversationId}`}
                className="ml-auto text-cyan-300/70 hover:text-cyan-200"
              >
                Open in chat
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
