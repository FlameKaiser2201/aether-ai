"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Braces,
  Download,
  File as FileIcon,
  FileJson,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  ScanText,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { ConfirmDialog } from "@/components/studio/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiBlob, errorMessage } from "@/lib/api";
import { cn, fileSize, formatRelative } from "@/lib/utils";
import type {
  AnalyzeResponse,
  FileList as FileListResponse,
  FileRecord,
} from "@/lib/types";

const ACCEPTED =
  ".pdf,.docx,.xlsx,.xlsm,.csv,.json,.txt,.md,.markdown,.log,.yaml,.yml,.html,.htm,.xml,.png,.jpg,.jpeg,.webp,.gif,.bmp";

const ANALYSIS_MODES = [
  {
    value: "analyze",
    label: "Deep analysis",
    hint: "What the document contains, what matters and what is missing",
  },
  {
    value: "summarize",
    label: "Summarize",
    hint: "A faithful summary that keeps the numbers and decisions",
  },
  {
    value: "extract",
    label: "Extract data",
    hint: "Pull structured data into JSON",
  },
] as const;

type AnalysisMode = (typeof ANALYSIS_MODES)[number]["value"];

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function FileGlyph({ name }: { name: string }) {
  const extension = extensionOf(name);
  if (["xlsx", "xlsm", "csv"].includes(extension)) {
    return <FileSpreadsheet className="h-4 w-4" />;
  }
  if (extension === "json") return <FileJson className="h-4 w-4" />;
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(extension)) {
    return <ImageIcon className="h-4 w-4" />;
  }
  if (["txt", "md", "markdown", "log", "yaml", "yml"].includes(extension)) {
    return <FileText className="h-4 w-4" />;
  }
  if (["html", "htm", "xml"].includes(extension)) {
    return <Braces className="h-4 w-4" />;
  }
  return <FileIcon className="h-4 w-4" />;
}

export function FilesPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selected, setSelected] = useState<FileRecord | null>(null);
  const [mode, setMode] = useState<AnalysisMode>("analyze");
  const [instruction, setInstruction] = useState("");
  const [schemaHint, setSchemaHint] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      const data = await api<FileListResponse>("files");
      setFiles(data.items);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function uploadFiles(list: FileList) {
    const items = Array.from(list);
    if (!items.length) return;
    setUploading(true);
    let latest: FileRecord | null = null;
    for (const file of items) {
      const form = new FormData();
      form.append("file", file);
      try {
        const record = await api<FileRecord>("files", {
          method: "POST",
          body: form,
        });
        latest = record;
        setFiles((previous) => [record, ...previous]);
        toast.success(`${file.name} uploaded`);
      } catch (error) {
        toast.error(`${file.name}: ${errorMessage(error)}`);
      }
    }
    if (latest) {
      setSelected(latest);
      setResult(null);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function chooseFile(record: FileRecord) {
    setSelected(record);
    setResult(null);
    setInstruction("");
    setSchemaHint("");
    setMode("analyze");
  }

  async function analyze() {
    if (!selected) return;
    setAnalyzing(true);
    try {
      const data = await api<AnalyzeResponse>(
        `files/${selected.id}/analyze`,
        {
          method: "POST",
          body: JSON.stringify({
            mode,
            instruction: instruction.trim() || null,
            schema_hint:
              mode === "extract" ? schemaHint.trim() || null : null,
          }),
        },
      );
      setResult(data);
      toast.success("Analysis ready");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAnalyzing(false);
    }
  }

  async function download(record: FileRecord) {
    setDownloadingId(record.id);
    try {
      const blob = await apiBlob(`files/${record.id}/download`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = record.original_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloadingId(null);
    }
  }

  async function removeFile() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`files/${deleteTarget.id}`, { method: "DELETE" });
      setFiles((previous) =>
        previous.filter((record) => record.id !== deleteTarget.id),
      );
      if (selected?.id === deleteTarget.id) {
        setSelected(null);
        setResult(null);
      }
      setDeleteTarget(null);
      toast.success("File deleted");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  const warning =
    selected && typeof selected.meta.warning === "string"
      ? selected.meta.warning
      : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.85fr)_1.15fr]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-200">
              <UploadCloud className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                File studio
              </h2>
              <p className="text-[10px] text-slate-500">
                Read, analyze, summarize and extract from documents.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              void uploadFiles(event.dataTransfer.files);
            }}
            disabled={uploading}
            className={cn(
              "mt-4 flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center transition-colors",
              dragActive
                ? "border-cyan-400/40 bg-cyan-400/[0.06]"
                : "border-white/[0.1] bg-white/[0.015] hover:border-cyan-400/25 hover:bg-white/[0.03]",
            )}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
            ) : (
              <UploadCloud
                className={cn(
                  "h-6 w-6",
                  dragActive ? "text-cyan-300" : "text-slate-500",
                )}
              />
            )}
            <span className="mt-2 text-[11.5px] font-medium text-slate-300">
              {uploading ? "Uploading and extracting text…" : "Drop files here or click to upload"}
            </span>
            <span className="mt-1 max-w-[240px] text-[9.5px] leading-4 text-slate-600">
              PDF, DOCX, XLSX, CSV, JSON, TXT, Markdown, HTML, XML and images ·
              up to 25 MB each
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files);
            }}
          />
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
              Your library
            </p>
            <span className="text-[10px] text-slate-600">{files.length}</span>
          </div>
          <div className="mt-2 space-y-1">
            {loading ? (
              [0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-12 w-full rounded-lg" />
              ))
            ) : files.length ? (
              files.slice(0, 30).map((record) => (
                <div
                  key={record.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                    selected?.id === record.id
                      ? "bg-white/[0.06]"
                      : "hover:bg-white/[0.04]",
                  )}
                >
                  <button
                    onClick={() => chooseFile(record)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-cyan-200/70">
                      <FileGlyph name={record.original_name} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] text-slate-300">
                        {record.original_name}
                      </span>
                      <span className="mt-0.5 block truncate text-[9px] text-slate-600">
                        {fileSize(record.size_bytes)}
                        {record.page_count ? ` · ${record.page_count} pages` : ""} ·{" "}
                        {formatRelative(record.created_at)}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => void download(record)}
                    disabled={downloadingId === record.id}
                    className="rounded p-1 text-slate-600 opacity-0 transition-all hover:bg-white/[0.06] hover:text-slate-300 group-hover:opacity-100"
                    aria-label="Download file"
                  >
                    {downloadingId === record.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(record)}
                    className="rounded p-1 text-slate-600 opacity-0 transition-all hover:bg-rose-400/10 hover:text-rose-300 group-hover:opacity-100"
                    aria-label="Delete file"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            ) : (
              <p className="py-3 text-center text-[10px] text-slate-600">
                Uploaded files will appear here.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-[500px] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        {selected ? (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-start gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="px-1.5 py-0 text-[9px] uppercase">
                    {extensionOf(selected.original_name) || "file"}
                  </Badge>
                  <Badge
                    variant={selected.status === "ready" ? "success" : "warning"}
                    className="px-1.5 py-0 text-[9px]"
                  >
                    {selected.status}
                  </Badge>
                  <span className="text-[9px] text-slate-600">
                    {fileSize(selected.size_bytes)}
                    {selected.page_count
                      ? ` · ${selected.page_count} pages`
                      : ""}
                  </span>
                </div>
                <h2 className="mt-1 truncate font-display text-base font-semibold text-white">
                  {selected.original_name}
                </h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void download(selected)}
                disabled={downloadingId === selected.id}
              >
                {downloadingId === selected.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download
              </Button>
            </div>

            <div className="space-y-3 border-b border-white/[0.06] p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="file-mode">Analysis mode</Label>
                  <Select
                    id="file-mode"
                    value={mode}
                    onChange={(event) =>
                      setMode(event.target.value as AnalysisMode)
                    }
                  >
                    {ANALYSIS_MODES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="file-instruction">
                    Focus <span className="text-slate-600">(optional)</span>
                  </Label>
                  <Input
                    id="file-instruction"
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    placeholder="e.g. Focus on risks and financial figures"
                    maxLength={4000}
                  />
                </div>
              </div>

              {mode === "extract" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="file-schema">
                    Desired JSON shape{" "}
                    <span className="text-slate-600">(optional)</span>
                  </Label>
                  <Input
                    id="file-schema"
                    value={schemaHint}
                    onChange={(event) => setSchemaHint(event.target.value)}
                    placeholder='e.g. {"invoice_number": "string", "total": "number", "items": []}'
                    maxLength={2000}
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="aurora"
                  onClick={() => void analyze()}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {analyzing ? "Reading the document…" : "Run analysis"}
                </Button>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-600">
                  <ScanText className="h-3 w-3" />
                  {ANALYSIS_MODES.find((item) => item.value === mode)?.hint}
                </span>
              </div>

              {warning ? (
                <p className="rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-[10px] leading-5 text-amber-200/80">
                  {warning}
                </p>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-5">
              {result ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="px-1.5 py-0 text-[9px] capitalize">
                      {result.mode}
                    </Badge>
                    <span className="text-[9px] text-slate-600">
                      {result.provider} · {result.model}
                    </span>
                  </div>
                  <Markdown content={result.content} />
                  {result.data != null ? (
                    <details className="rounded-xl border border-white/[0.07] bg-black/25 p-3">
                      <summary className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-cyan-300/70">
                        Structured data
                      </summary>
                      <pre className="mt-2 max-h-72 overflow-auto font-mono text-[10.5px] leading-5 text-slate-300 scrollbar-thin">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                  <ScanText className="h-6 w-6 text-slate-600" />
                  <p className="mt-2 text-[11.5px] font-medium text-slate-300">
                    No analysis yet
                  </p>
                  <p className="mt-1 max-w-xs text-[10px] leading-5 text-slate-600">
                    Choose a mode and run the analysis. AETHER uses only the text
                    extracted from this file and never invents missing facts.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[500px] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <FileText className="h-5 w-5 text-cyan-200/70" />
            </div>
            <p className="mt-4 font-display text-base font-semibold text-white">
              Select a document to analyze
            </p>
            <p className="mt-1 max-w-sm text-[11px] leading-5 text-slate-500">
              Upload a PDF, Word document, spreadsheet, CSV, JSON, image or text
              file. Text is extracted and chunked for grounded answers and
              citations.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete this file?"
        description="The file, its extracted text and every indexed chunk will be permanently removed from storage."
        busy={deleting}
        onConfirm={() => void removeFile()}
      />
    </div>
  );
}
