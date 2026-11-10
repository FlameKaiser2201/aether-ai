import { ApiError } from "@/lib/api";
import { refreshSession, sessionWasRefreshed } from "@/lib/session-refresh";
import { readSSE } from "@/lib/sse";
import type {
  ChatMeta,
  ChatMode,
  Citation,
  ValidationReport,
} from "@/lib/types";

export interface ChatStreamRequest {
  message: string;
  conversation_id?: string;
  mode: ChatMode;
  file_ids?: string[];
  web_search?: boolean | null;
  voice?: boolean;
  language?: string | null;
}

export interface StreamDone {
  conversation_id: string;
  message_id: string;
  title: string;
  memory_queued: boolean;
}

export interface StreamUsage {
  input_tokens: number;
  output_tokens: number;
  latency_ms?: number;
}

export interface StreamHandlers {
  onMeta?: (meta: ChatMeta) => void;
  onStatus?: (stage: string, message: string) => void;
  onCitations?: (citations: Citation[]) => void;
  onToken?: (text: string) => void;
  onValidation?: (blocks: ValidationReport[]) => void;
  onUsage?: (usage: StreamUsage) => void;
  onDone?: (done: StreamDone) => void;
  onError?: (error: { code: string; message: string }) => void;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Stream a chat turn through the authenticated Next.js proxy and dispatch each
 * server-sent event to the supplied handlers.
 */
export async function streamChat(
  payload: ChatStreamRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const send = () =>
    fetch("/api/proxy/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(payload),
      signal,
      cache: "no-store",
    });

  let response = await send();
  if (response.status === 401 && typeof window !== "undefined") {
    // Refresh an expired backend access token once, then retry the turn.
    const session = await refreshSession();
    if (sessionWasRefreshed(session)) {
      response = await send();
    }
  }

  if (!response.ok) {
    let message = "AETHER could not start the response.";
    let code = "chat_failed";
    try {
      const data = (await response.json()) as {
        error?: { message?: string; code?: string };
      };
      message = data.error?.message ?? message;
      code = data.error?.code ?? code;
    } catch {
      // keep the fallback message
    }
    throw new ApiError(message, response.status, code);
  }

  await readSSE(
    response,
    ({ event, data }) => {
      switch (event) {
        case "meta":
          handlers.onMeta?.({
            conversation_id: str(data.conversation_id),
            message_id: (data.message_id as string | null) ?? null,
            provider: str(data.provider, "unknown"),
            model: str(data.model, "unknown"),
            tier: str(data.tier, "fast"),
            task_type: str(data.task_type, "general"),
            routing_reason: str(data.routing_reason),
            demo: Boolean(data.demo),
            plan: Array.isArray(data.plan) ? (data.plan as ChatMeta["plan"]) : [],
            mode: str(data.mode, "auto") as ChatMode,
          });
          break;
        case "status":
          handlers.onStatus?.(str(data.stage), str(data.message));
          break;
        case "citations":
          handlers.onCitations?.(
            Array.isArray(data.sources) ? (data.sources as Citation[]) : [],
          );
          break;
        case "token":
          handlers.onToken?.(str(data.text));
          break;
        case "validation":
          handlers.onValidation?.(
            Array.isArray(data.blocks)
              ? (data.blocks as ValidationReport[])
              : [],
          );
          break;
        case "usage":
          handlers.onUsage?.({
            input_tokens: num(data.input_tokens),
            output_tokens: num(data.output_tokens),
            latency_ms: num(data.latency_ms),
          });
          break;
        case "done":
          handlers.onDone?.({
            conversation_id: str(data.conversation_id),
            message_id: str(data.message_id),
            title: str(data.title),
            memory_queued: Boolean(data.memory_queued),
          });
          break;
        case "error":
          handlers.onError?.({
            code: str(data.code, "chat_failed"),
            message: str(data.message, "AETHER could not complete that response."),
          });
          break;
        default:
          break;
      }
    },
    signal,
  );
}
