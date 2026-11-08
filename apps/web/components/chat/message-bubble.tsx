"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  FileText,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { AetherMark } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { cn, fileSize, formatRelative, truncate } from "@/lib/utils";
import type { Message, ValidationReport } from "@/lib/types";

interface AttachmentMeta {
  name: string;
  size: number;
}

function readAttachments(meta: Record<string, unknown>): AttachmentMeta[] {
  if (!Array.isArray(meta.attachments)) return [];
  return meta.attachments.filter(
    (item): item is AttachmentMeta =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as AttachmentMeta).name === "string",
  );
}

function readValidation(meta: Record<string, unknown>): ValidationReport[] {
  return Array.isArray(meta.validation)
    ? (meta.validation as ValidationReport[])
    : [];
}

function ValidationSummary({ blocks }: { blocks: ValidationReport[] }) {
  const issues = blocks.flatMap((block) => block.issues ?? []);
  if (!issues.length) {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-300/80">
        <CheckCircle2 className="h-3 w-3" /> Code validation passed
      </div>
    );
  }
  const errors = issues.filter((issue) => issue.severity === "error").length;
  return (
    <details className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2">
      <summary className="cursor-pointer text-[10px] uppercase tracking-[0.14em] text-amber-200/90">
        Validation · {issues.length} finding{issues.length === 1 ? "" : "s"}
        {errors ? ` · ${errors} error${errors === 1 ? "" : "s"}` : ""}
      </summary>
      <ul className="mt-2 space-y-1.5">
        {issues.slice(0, 8).map((issue, index) => (
          <li key={`${issue.rule}-${index}`} className="text-[11px] leading-5">
            <span
              className={cn(
                "mr-1.5 rounded px-1 py-0.5 font-mono text-[9px] uppercase",
                issue.severity === "error"
                  ? "bg-rose-400/15 text-rose-200"
                  : "bg-amber-400/15 text-amber-200",
              )}
            >
              {issue.severity}
            </span>
            <span className="text-slate-300">{issue.message}</span>
            {issue.line ? (
              <span className="ml-1 text-slate-500">line {issue.line}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function MessageBubble({
  message,
  status,
  onSpeak,
  speaking = false,
  showRouting = true,
}: {
  message: Message;
  status?: string | null;
  onSpeak?: (text: string) => void;
  speaking?: boolean;
  showRouting?: boolean;
}) {
  const isUser = message.role === "user";
  const attachments = readAttachments(message.meta ?? {});
  const validation = readValidation(message.meta ?? {});
  const errorCode =
    typeof message.meta?.error === "string" ? message.meta.error : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Clipboard access was blocked");
    }
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] sm:max-w-[78%]">
          <div className="rounded-2xl rounded-br-md border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-[0.92rem] leading-7 text-slate-100 shadow-[0_10px_30px_-24px_rgba(34,211,238,0.7)]">
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>
          {attachments.length ? (
            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
              {attachments.map((attachment) => (
                <span
                  key={attachment.name}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-400"
                >
                  <FileText className="h-3 w-3" />
                  {truncate(attachment.name, 32)}
                  {attachment.size ? (
                    <span className="text-slate-600">{fileSize(attachment.size)}</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
          <p className="mt-1.5 text-right text-[10px] text-slate-600">
            {formatRelative(message.created_at)}
          </p>
        </div>
      </div>
    );
  }

  const empty = !message.content.trim();

  return (
    <div className="flex gap-3 sm:gap-4">
      <AetherMark className="mt-0.5 h-8 w-8 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="font-display text-xs font-semibold tracking-wide text-slate-200">
            AETHER
          </span>
          {showRouting && message.provider ? (
            <>
              <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                {message.provider}
              </Badge>
              <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                {message.model}
              </Badge>
            </>
          ) : null}
          {typeof message.meta?.demo === "boolean" && message.meta.demo ? (
            <Badge variant="warning" className="px-1.5 py-0 text-[9px]">
              demo
            </Badge>
          ) : null}
          <span className="text-[10px] text-slate-600">
            {formatRelative(message.created_at)}
          </span>
        </div>

        <div
          className={cn(
            "rounded-2xl rounded-tl-md border px-4 py-3.5 sm:px-5",
            errorCode
              ? "border-rose-400/20 bg-rose-400/[0.04]"
              : "border-white/[0.07] bg-white/[0.025]",
          )}
        >
          {empty && message.pending ? (
            <div className="flex items-center gap-2 py-1 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
              <span className="shimmer-text">
                {status || "Thinking…"}
              </span>
            </div>
          ) : null}

          {message.content ? (
            <Markdown content={message.content} />
          ) : null}

          {message.pending && message.content ? (
            <span className="mt-2 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-cyan-300/80 align-middle" />
          ) : null}

          {errorCode ? (
            <div className="mt-3 flex items-start gap-2 border-t border-rose-400/10 pt-3 text-[11px] leading-5 text-rose-200/90">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The response stopped before completion. You can retry your message.
            </div>
          ) : null}

          {validation.length ? <ValidationSummary blocks={validation} /> : null}

          {message.citations?.length ? (
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
                Sources
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.citations.map((citation) => (
                  <a
                    key={`${citation.index}-${citation.url}`}
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[10px] text-slate-400 transition-colors hover:border-cyan-400/25 hover:text-cyan-200"
                  >
                    <span className="font-mono text-cyan-300/80">
                      [{citation.index}]
                    </span>
                    {truncate(citation.title, 60)}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {!message.pending && message.content ? (
          <div className="mt-1.5 flex items-center gap-1">
            <button
              onClick={() => void copy()}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
            >
              <Clipboard className="h-3 w-3" /> Copy
            </button>
            {onSpeak ? (
              <button
                onClick={() => onSpeak(message.content)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
              >
                {speaking ? (
                  <>
                    <VolumeX className="h-3 w-3" /> Stop
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3 w-3" /> Speak
                  </>
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
