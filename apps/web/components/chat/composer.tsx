"use client";

import { useEffect, useRef } from "react";
import {
  ArrowUp,
  AudioLines,
  FileText,
  Globe2,
  Loader2,
  Mic,
  Paperclip,
  Square,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, fileSize, truncate } from "@/lib/utils";
import type { FileRecord } from "@/lib/types";

export function Composer({
  value,
  onChange,
  onSend,
  streaming,
  onStop,
  attachments,
  onRemoveAttachment,
  onFiles,
  uploading,
  webSearch,
  onWebSearchChange,
  listening,
  onToggleDictation,
  dictationSupported,
  interim,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  streaming: boolean;
  onStop: () => void;
  attachments: FileRecord[];
  onRemoveAttachment: (id: string) => void;
  onFiles: (files: FileList | null) => void;
  uploading: boolean;
  webSearch: boolean;
  onWebSearchChange: (value: boolean) => void;
  listening: boolean;
  onToggleDictation: () => void;
  dictationSupported: boolean;
  interim?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [value]);

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!streaming) onSend();
    }
  }

  return (
    <div className="border-t border-white/[0.06] bg-[#05060a]/80 px-3 py-3 backdrop-blur-2xl sm:px-6 sm:py-4">
      <div className="mx-auto w-full max-w-3xl">
        {attachments.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.06] px-2 py-1 text-[10px] text-cyan-100"
              >
                <FileText className="h-3 w-3" />
                {truncate(attachment.original_name, 34)}
                <span className="text-cyan-300/50">
                  {fileSize(attachment.size_bytes)}
                </span>
                <button
                  onClick={() => onRemoveAttachment(attachment.id)}
                  className="ml-0.5 rounded p-0.5 text-cyan-200/60 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={`Remove ${attachment.original_name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div
          className={cn(
            "relative rounded-2xl border bg-white/[0.025] transition-colors",
            listening
              ? "border-cyan-400/40 shadow-[0_0_0_3px_rgba(34,211,238,0.06)]"
              : "border-white/[0.09] focus-within:border-cyan-400/30",
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={20000}
            placeholder={
              listening
                ? "Listening… speak now"
                : "Ask anything — study, code, interviews, research…"
            }
            className="max-h-[200px] min-h-[52px] w-full resize-none bg-transparent px-4 py-3.5 pr-4 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500"
          />
          {interim ? (
            <p className="px-4 pb-2 text-[11px] italic text-cyan-300/70">
              {interim}
            </p>
          ) : null}

          <div className="flex items-center gap-1 px-2 pb-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.csv,.json,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif,.md,.py,.js,.ts,.tsx,.java,.cpp,.c,.cs,.go,.rs,.php,.sql,.dart,.kt,.swift,.rb"
              className="hidden"
              onChange={(event) => {
                onFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || attachments.length >= 8}
              title="Attach a document or image (max 8)"
              aria-label="Attach files"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onWebSearchChange(!webSearch)}
              title={
                webSearch
                  ? "Web search: always on"
                  : "Web search: auto — used when current information is needed"
              }
              aria-label="Toggle web search"
              className={cn(
                webSearch && "bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15",
              )}
            >
              <Globe2 className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleDictation}
              disabled={!dictationSupported}
              title={
                dictationSupported
                  ? listening
                    ? "Stop dictation"
                    : "Dictate your message"
                  : "Speech recognition is not supported in this browser"
              }
              aria-label="Toggle dictation"
              className={cn(
                listening &&
                  "bg-rose-400/10 text-rose-200 hover:bg-rose-400/15",
              )}
            >
              {listening ? (
                <AudioLines className="h-4 w-4 animate-pulse" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-[9px] text-slate-600 sm:block">
                {value.length > 0 ? `${value.length} / 20,000` : "Enter to send"}
              </span>
              {streaming ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onStop}
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="aurora"
                  size="icon"
                  onClick={onSend}
                  disabled={!value.trim()}
                  title="Send message"
                  aria-label="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-[9px] leading-4 text-slate-600">
            AETHER can make mistakes. Verify important facts, code and citations.
          </p>
          <p className="text-[9px] text-slate-600">
            {webSearch ? (
              <span className="inline-flex items-center gap-1 text-cyan-300/70">
                <Globe2 className="h-2.5 w-2.5" /> web research forced
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Globe2 className="h-2.5 w-2.5" /> web research auto · Shift +
                Enter for a new line
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
