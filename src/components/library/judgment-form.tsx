"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, FileUp, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { splitJudgmentParas, type GuessedMeta } from "@/lib/judgments/text";
import { LICENCE_OPTIONS } from "@/lib/judgments/sources";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { cn, formatBytes } from "@/lib/utils";

type Meta = {
  court: string;
  title: string;
  parties: string;
  decidedOn: string;
  citation: string;
  caseNo: string;
  bench: string;
  sourceUrl: string;
  licence: string;
  summary: string;
};

const EMPTY: Meta = {
  court: "",
  title: "",
  parties: "",
  decidedOn: "",
  citation: "",
  caseNo: "",
  bench: "",
  sourceUrl: "",
  licence: LICENCE_OPTIONS[0].value,
  summary: "",
};

const OTHER = "__other";

/** Admin "Add judgment": upload or paste, review metadata and paragraphs, save. */
export function JudgmentForm({ courts, maxBytes }: { courts: string[]; maxBytes: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<"file" | "paste">("file");
  const [text, setText] = useState("");
  const [meta, setMeta] = useState<Meta>(EMPTY);
  const [licenceChoice, setLicenceChoice] = useState<string>(LICENCE_OPTIONS[0].value);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; pages: number | null } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; existingId?: string | null } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const deferred = useDeferredValue(text);
  const split = useMemo(() => (deferred.trim() ? splitJudgmentParas(deferred) : null), [deferred]);
  const numbered = split?.paras.filter((p) => p.paraNo > 0) ?? [];
  const head = split?.paras.find((p) => p.paraNo === 0);

  const set = (k: keyof Meta) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setMeta((m) => ({ ...m, [k]: e.target.value }));

  function applyGuess(g: GuessedMeta) {
    setMeta((m) => ({
      ...m,
      court: m.court || g.court || "",
      title: m.title || g.title || "",
      decidedOn: m.decidedOn || g.decidedOn || "",
      citation: m.citation || g.citation || "",
      caseNo: m.caseNo || g.caseNo || "",
      bench: m.bench || g.bench || "",
    }));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > maxBytes) {
      setError({ message: `The file is larger than ${formatBytes(maxBytes)}.` });
      return;
    }
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/library/extract", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string; text?: string; pageCount?: number | null; meta?: GuessedMeta };
      if (!res.ok || !body.text) {
        setError({ message: body.error ?? "The file could not be read." });
        return;
      }
      setText(body.text);
      setFileInfo({ name: file.name, size: file.size, pages: body.pageCount ?? null });
      if (body.meta) applyGuess(body.meta);
      toast.success("Text extracted. Check the details and paragraphs.");
    } catch {
      setError({ message: "The upload failed. Check your connection and try again." });
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setError(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const res = await fetch("/api/admin/library/judgments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...meta, text }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string>; existingId?: string | null; id?: string; paras?: number };
      if (!res.ok || !body.id) {
        setFieldErrors(body.fieldErrors ?? {});
        setError({ message: body.error ?? "The judgment could not be saved.", existingId: body.existingId });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const id = body.id;
      toast.success(`Added with ${body.paras} paragraphs.`, { action: { label: "Open", onClick: () => router.push(`/app/research/case/${id}`) } });
      router.push("/admin/library?tab=judgments");
      router.refresh();
    } catch {
      setError({ message: "Saving failed. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  const ready = text.trim().length >= 50 && meta.court.trim().length >= 3 && meta.title.trim().length >= 3 && meta.licence.trim().length >= 2;

  return (
    <form
      className="space-y-5 pb-24"
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving) void save();
      }}
    >
      {error ? (
        <Alert tone="danger" title={error.message}>
          {error.existingId ? (
            <Link href={`/app/research/case/${error.existingId}`} className="font-medium text-primary hover:underline">
              Open the existing judgment
            </Link>
          ) : null}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 text-[15px] font-bold tracking-tight text-ink">1. Judgment text</h2>
            <div role="radiogroup" aria-label="How to add the text" className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 sm:inline-grid">
              {(
                [
                  { value: "file", label: "Upload file" },
                  { value: "paste", label: "Paste text" },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={source === o.value}
                  onClick={() => setSource(o.value)}
                  className={cn(
                    "min-h-11 cursor-pointer rounded-full px-4 text-sm font-semibold transition-colors sm:min-h-9",
                    source === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {source === "file" ? (
              <label
                htmlFor="jf-file"
                className={cn(
                  "mb-4 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-strong bg-surface-2/50 px-4 py-6 text-center hover:border-primary/50",
                  extracting && "pointer-events-none opacity-70",
                )}
              >
                {extracting ? <Loader2 className="size-6 animate-spin text-primary" aria-hidden /> : <FileUp className="size-6 text-primary" aria-hidden />}
                <span className="text-sm font-semibold text-ink">{extracting ? "Reading the file…" : "Choose a PDF, Word (.docx) or text file"}</span>
                <span className="text-xs text-muted">Up to {formatBytes(maxBytes)}. Scanned PDFs without a text layer cannot be read.</span>
                <input
                  ref={fileRef}
                  id="jf-file"
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </label>
            ) : null}
            {fileInfo && source === "file" ? (
              <p className="mb-3 flex items-center gap-2 text-sm text-ink-2">
                <CheckCircle2 className="size-4 text-success" aria-hidden />
                <span className="truncate">{fileInfo.name}</span>
                <span className="shrink-0 text-muted tabular">
                  {formatBytes(fileInfo.size)}
                  {fileInfo.pages ? ` · ${fileInfo.pages} pages` : ""}
                </span>
              </p>
            ) : null}
            <Field
              label={source === "file" ? "Extracted text (you can correct it)" : "Judgment text"}
              htmlFor="jf-text"
              required
              error={fieldErrors.text}
              hint="Paragraph numbers at the start of lines (“1.”, “12.”) are kept; otherwise paragraphs split on blank lines."
            >
              <Textarea id="jf-text" rows={source === "paste" ? 16 : 10} value={text} onChange={(e) => setText(e.target.value)} className="font-serif text-[15px]" />
            </Field>
            <p className="mt-2 text-xs text-muted tabular">{text.length.toLocaleString("en-IN")} characters</p>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="mb-1 text-[15px] font-bold tracking-tight text-ink">2. Details</h2>
            <p className="mb-4 text-sm text-muted">Filled from the first page where possible. Check every field against the judgment.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Court" htmlFor="jf-court" required error={fieldErrors.court} className="sm:col-span-2">
                <Input id="jf-court" list="jf-courts" value={meta.court} onChange={set("court")} required maxLength={200} autoComplete="off" placeholder="Supreme Court of India" />
              </Field>
              <Field label="Case title" htmlFor="jf-title" required error={fieldErrors.title} hint="As cited, e.g. Arnesh Kumar v. State of Bihar." className="sm:col-span-2">
                <Input id="jf-title" value={meta.title} onChange={set("title")} required maxLength={500} autoComplete="off" />
              </Field>
              <Field label="All parties" htmlFor="jf-parties" error={fieldErrors.parties} hint="Optional: the full cause title, aliases, “& Ors.”." className="sm:col-span-2">
                <Input id="jf-parties" value={meta.parties} onChange={set("parties")} maxLength={2000} autoComplete="off" />
              </Field>
              <Field label="Decided on" htmlFor="jf-date" error={fieldErrors.decidedOn}>
                <Input id="jf-date" type="date" value={meta.decidedOn} onChange={set("decidedOn")} />
              </Field>
              <Field label="Case number" htmlFor="jf-caseno" error={fieldErrors.caseNo}>
                <Input id="jf-caseno" value={meta.caseNo} onChange={set("caseNo")} maxLength={300} autoComplete="off" placeholder="Criminal Appeal No. 1277 of 2014" />
              </Field>
              <Field label="Citation" htmlFor="jf-cite" error={fieldErrors.citation} hint="Neutral or reported. Separate several with “;”." className="sm:col-span-2">
                <Input id="jf-cite" value={meta.citation} onChange={set("citation")} maxLength={500} autoComplete="off" placeholder="2024 INSC 735; [2024] 10 S.C.R. 108" className="tabular" />
              </Field>
              <Field label="Bench" htmlFor="jf-bench" error={fieldErrors.bench} className="sm:col-span-2">
                <Input id="jf-bench" value={meta.bench} onChange={set("bench")} maxLength={500} autoComplete="off" placeholder="Judges, separated by commas" />
              </Field>
              <Field label="Source link" htmlFor="jf-url" error={fieldErrors.sourceUrl} hint="Where this copy came from, e.g. the court's website." className="sm:col-span-2">
                <Input id="jf-url" type="url" value={meta.sourceUrl} onChange={set("sourceUrl")} maxLength={1000} placeholder="https://" />
              </Field>
              <Field
                label="Licence or basis for reuse"
                htmlFor="jf-licence"
                required
                error={fieldErrors.licence}
                hint="Use the court's own copy. Reporter versions (SCC, AIR) carry copyrighted headnotes: do not upload them without the rights."
                className="sm:col-span-2"
              >
                <Select
                  id="jf-licence"
                  value={licenceChoice}
                  onChange={(e) => {
                    setLicenceChoice(e.target.value);
                    setMeta((m) => ({ ...m, licence: e.target.value === OTHER ? "" : e.target.value }));
                  }}
                >
                  {LICENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  <option value={OTHER}>Other…</option>
                </Select>
              </Field>
              {licenceChoice === OTHER ? (
                <Field label="Licence" htmlFor="jf-licence-other" required className="sm:col-span-2">
                  <Input id="jf-licence-other" value={meta.licence} onChange={set("licence")} maxLength={200} required autoComplete="off" />
                </Field>
              ) : null}
              <Field label="Short summary" htmlFor="jf-summary" error={fieldErrors.summary} hint="Optional, your own words: the issue and what was held." className="sm:col-span-2">
                <Textarea id="jf-summary" rows={3} value={meta.summary} onChange={set("summary")} maxLength={1500} />
              </Field>
            </div>
            <datalist id="jf-courts">
              {courts.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="p-4 sm:p-5 lg:sticky lg:top-20">
            <h2 className="mb-1 text-[15px] font-bold tracking-tight text-ink">3. Paragraphs</h2>
            {!split ? (
              <p className="text-sm text-muted">Upload or paste the text to see how it will be split.</p>
            ) : split.paras.length === 0 ? (
              <p className="text-sm text-danger">No paragraphs found in this text.</p>
            ) : (
              <>
                <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                  <span className="font-semibold tabular">{numbered.length}</span> paragraphs
                  <Badge tone={split.mode === "numbered" ? "success" : "warning"} dot>
                    {split.mode === "numbered" ? "Numbered as in the judgment" : "Split on blank lines"}
                  </Badge>
                </p>
                {split.mode === "blocks" ? (
                  <p className="mb-3 text-xs text-muted">No paragraph numbers were found, so paragraph numbers are assigned in order. Answers will cite these numbers.</p>
                ) : null}
                <ol className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                  {head ? (
                    <li className="rounded-md bg-surface-2/70 p-3">
                      <p className="text-xs font-semibold text-muted">Before para 1 (cause title, headnote)</p>
                      <p className="mt-1 line-clamp-3 text-[13px] text-ink-2">{head.text}</p>
                    </li>
                  ) : null}
                  {numbered.slice(0, 6).map((p) => (
                    <li key={p.paraNo} className="flex gap-2">
                      <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold text-primary tabular">{p.paraNo}.</span>
                      <p className="line-clamp-3 text-[13px] text-ink-2">{p.text}</p>
                    </li>
                  ))}
                  {numbered.length > 8 ? <li className="pl-10 text-xs text-muted tabular">… {numbered.length - 8} more …</li> : null}
                  {numbered.slice(Math.max(6, numbered.length - 2)).map((p) => (
                    <li key={p.paraNo} className="flex gap-2">
                      <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold text-primary tabular">{p.paraNo}.</span>
                      <p className="line-clamp-3 text-[13px] text-ink-2">{p.text}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Card>
        </div>
      </div>

      <div className="glass safe-bottom sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:mx-0 sm:rounded-full sm:border sm:px-5">
        <p className="min-w-0 truncate text-sm text-ink-2">{ready ? "Ready to add to the library." : "Add the text, court, title and licence."}</p>
        <Button type="submit" disabled={!ready || saving || extracting}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save judgment
        </Button>
      </div>
    </form>
  );
}
