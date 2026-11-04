"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { Field, Select } from "@/components/ui/form";
import { cn, formatBytes } from "@/lib/utils";

type Item = {
  key: string;
  name: string;
  size: number;
  progress: number;
  state: "uploading" | "ready" | "failed" | "error";
  message?: string;
  id?: string;
};

const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
const ALLOWED = /\.(pdf|docx|txt)$/i;

function upload(file: File, matterId: string, onProgress: (p: number) => void) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ status: xhr.status, body: (xhr.response as Record<string, unknown>) ?? {} });
    xhr.onerror = () => resolve({ status: 0, body: { error: "Network error. Check your connection and try again." } });
    const fd = new FormData();
    fd.append("file", file);
    if (matterId) fd.append("matterId", matterId);
    xhr.send(fd);
  });
}

export function UploadDropzone({ maxBytes, matters }: { maxBytes: number; matters: { id: string; title: string }[] }) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [matterId, setMatterId] = useState("");

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, 10);
    for (const file of list) {
      const key = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`;
      const base: Item = { key, name: file.name, size: file.size, progress: 0, state: "uploading" };
      if (!ALLOWED.test(file.name)) {
        setItems((l) => [{ ...base, state: "error", message: "Only PDF, Word (.docx) and text (.txt) files are supported." }, ...l]);
        continue;
      }
      if (file.size > maxBytes) {
        setItems((l) => [{ ...base, state: "error", message: `Larger than the ${formatBytes(maxBytes)} limit.` }, ...l]);
        continue;
      }
      setItems((l) => [base, ...l]);
      const res = await upload(file, matterId, (p) => patch(key, { progress: p }));
      if (res.status === 200 && typeof res.body.id === "string") {
        const failed = res.body.status === "failed";
        patch(key, {
          state: failed ? "failed" : "ready",
          progress: 100,
          id: res.body.id,
          message: failed ? String(res.body.error ?? "No text could be extracted.") : "Text extracted",
        });
        router.refresh();
      } else {
        patch(key, { state: "error", message: String(res.body.error ?? "Upload failed. Please try again.") });
      }
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
            over ? "border-primary bg-primary-soft/50" : "border-border-strong bg-surface-2/40",
          )}
        >
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
            <FileUp className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-medium text-ink">Drop files here or choose from your device</p>
            <p className="mt-1 text-sm text-muted">PDF, Word (.docx) or text, up to {formatBytes(maxBytes)} each. Scanned PDFs need OCR, which is not available yet.</p>
          </div>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button type="button" onClick={() => inputRef.current?.click()}>
            Choose files
          </Button>
        </div>
        <div className="space-y-3">
          <Field label="Link to matter (optional)" htmlFor="upload-matter" hint="Applies to the next files you upload.">
            <Select id="upload-matter" value={matterId} onChange={(e) => setMatterId(e.target.value)}>
              <option value="">No matter</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-[13px] text-muted">Files are stored privately and identified by their contents, not their names. Only you can open them.</p>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border" aria-live="polite">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 px-3 py-2.5">
              <StateIcon state={i.state} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{i.name}</p>
                {i.state === "uploading" ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${i.name}`}>
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${i.progress}%` }} />
                    </div>
                    <span className="text-xs text-muted tabular-nums">{i.progress < 100 ? `${i.progress}%` : "Reading text…"}</span>
                  </div>
                ) : (
                  <p className={cn("text-xs", i.state === "ready" ? "text-muted" : i.state === "failed" ? "text-warning" : "text-danger")}>
                    {formatBytes(i.size)} · {i.message}
                  </p>
                )}
              </div>
              {i.id ? (
                <Link href={`/app/documents/${i.id}`} className="shrink-0 text-sm text-primary hover:underline">
                  Open
                </Link>
              ) : null}
              {i.state !== "uploading" ? (
                <button
                  type="button"
                  onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))}
                  className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                  aria-label={`Dismiss ${i.name}`}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function StateIcon({ state }: { state: Item["state"] }) {
  if (state === "uploading") return <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-label="Uploading" />;
  if (state === "ready") return <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Ready" />;
  if (state === "failed") return <AlertTriangle className="size-5 shrink-0 text-warning" aria-label="Uploaded, no text" />;
  return <XCircle className="size-5 shrink-0 text-danger" aria-label="Failed" />;
}
