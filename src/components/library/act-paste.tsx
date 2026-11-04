"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Eye, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveSectionsBatch } from "@/app/admin/library/actions";
import { splitActText, type ParsedSection } from "@/lib/corpus/act-text";
import { listSectionNos, planSectionEdits, unsafePlanReason, type CurrentSectionLike } from "@/lib/corpus/plan";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";

const BATCH_SECTIONS = 40;
const BATCH_CHARS = 600_000; // stays under the 1 MB server-action body limit

function batches<T extends ParsedSection>(items: T[]): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let size = 0;
  for (const s of items) {
    const n = s.text.length + s.heading.length + 200;
    if (cur.length && (cur.length >= BATCH_SECTIONS || size + n > BATCH_CHARS)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(s);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

type Status = "new" | "changed" | "same";

/** Pasted sections as the plan sees them: no chapter in the paste keeps the stored chapter. */
const asPlanned = (s: ParsedSection) => ({ sectionNo: s.sectionNo, heading: s.heading, text: s.text, chapter: s.chapter ?? undefined });

/**
 * "Paste full act text": splits pasted text into numbered sections and compares them
 * with the act using the same plan as the India Code sync and the server
 * (src/lib/corpus/plan.ts): new, changed, unchanged, and sections missing from the
 * paste. Saves only new and changed sections, in batches, each batch in one
 * transaction through reviseSections; optionally removes the missing ones, within
 * the same safety limit as the sync.
 */
export function ActPaste({ actId, current, existing }: { actId: string; current?: CurrentSectionLike[]; existing?: string[] }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof splitActText> | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [removeMissing, setRemoveMissing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ added: number; changed: number; unchanged: number; removed: number } | null>(null);
  // `existing` (section numbers only) is the older prop: every existing section then counts as changed.
  const cur = useMemo<CurrentSectionLike[]>(() => current ?? (existing ?? []).map((sectionNo) => ({ sectionNo })), [current, existing]);

  // The full paste decides what is missing; the selection decides what is saved.
  const fullPlan = useMemo(() => (parsed ? planSectionEdits(cur, parsed.sections.map(asPlanned), { removeMissing: true }) : null), [parsed, cur]);
  const status = useMemo(() => {
    const m = new Map<string, Status>();
    if (!fullPlan) return m;
    for (const s of fullPlan.added) m.set(s.sectionNo, "new");
    for (const s of fullPlan.changed) m.set(s.sectionNo, "changed");
    for (const no of fullPlan.unchanged) m.set(no, "same");
    return m;
  }, [fullPlan]);
  const missing = fullPlan?.removed ?? [];
  const unsafe = parsed && missing.length ? unsafePlanReason({ removed: missing }, cur.length, parsed.sections.length, { source: "The pasted text" }) : null;

  const selected = parsed ? parsed.sections.filter((s) => !skip.has(s.sectionNo)) : [];
  const toSave = selected.filter((s) => status.get(s.sectionNo) !== "same");
  const counts = {
    added: selected.filter((s) => status.get(s.sectionNo) === "new").length,
    changed: selected.filter((s) => status.get(s.sectionNo) === "changed").length,
    unchanged: selected.filter((s) => status.get(s.sectionNo) === "same").length,
  };
  const removing = removeMissing && !unsafe ? missing : [];
  const saving = progress !== null && !result;

  async function save() {
    if (note.trim().length < 5) {
      toast.error("Add a change note (at least 5 characters).");
      return;
    }
    // A brand-new act keeps the pasted order exactly; otherwise the server places new sections.
    const ordered = toSave.map((s) => ({ ...s, sortKey: cur.length === 0 ? (selected.indexOf(s) + 1) * 10 : undefined }));
    const parts: { sections: typeof ordered; remove: string[] }[] = batches(ordered).map((p) => ({ sections: p, remove: [] }));
    if (removing.length) parts.push({ sections: [], remove: removing });
    const totals = { added: 0, changed: 0, unchanged: counts.unchanged, removed: 0 };
    const total = ordered.length + removing.length;
    setResult(null);
    setProgress({ done: 0, total });
    let done = 0;
    for (const part of parts) {
      const res = await saveSectionsBatch({
        actId,
        note,
        sections: part.sections.map((s) => ({ sectionNo: s.sectionNo, heading: s.heading, text: s.text, chapter: s.chapter, sortKey: s.sortKey })),
        remove: part.remove.length ? part.remove : undefined,
      });
      if (!res.ok) {
        toast.error(`Stopped after ${done} of ${total}: ${res.error}`);
        setProgress(null);
        setResult(totals);
        router.refresh();
        return;
      }
      totals.added += res.data.added;
      totals.changed += res.data.changed;
      totals.unchanged += res.data.unchanged;
      totals.removed += res.data.removed;
      done += part.sections.length + part.remove.length;
      setProgress({ done, total });
    }
    setResult(totals);
    toast.success(`Saved: ${totals.added} added, ${totals.changed} changed, ${totals.removed} removed, ${totals.unchanged} unchanged.`);
    router.refresh();
  }

  return (
    <section aria-labelledby="paste-heading">
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-start gap-3">
          <ClipboardPaste className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
          <div>
            <h2 id="paste-heading" className="text-[15px] font-bold tracking-tight text-ink">
              Paste full act text
            </h2>
            <p className="text-sm text-muted">
              Paste the act from India Code or the Gazette. Sections are found by their numbers (“1. Short title.—…”, “3A. …”). Review the preview, then
              save. Existing sections are updated only where the text differs.
            </p>
          </div>
        </div>
        <Field label="Act text" htmlFor="paste-raw">
          <Textarea
            id="paste-raw"
            rows={8}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setParsed(null);
              setResult(null);
            }}
            placeholder={"CHAPTER I\nPRELIMINARY\n1. Short title, extent and commencement.—(1) This Act may be called…"}
            className="font-mono text-[13px]"
          />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!raw.trim() || saving}
            onClick={() => {
              const r = splitActText(raw);
              setParsed(r);
              setSkip(new Set());
              setRemoveMissing(false);
              setResult(null);
              if (r.sections.length === 0) toast.error("No numbered sections were found.");
            }}
          >
            <Eye /> Preview sections
          </Button>
        </div>

        {parsed && parsed.sections.length > 0 ? (
          <div className="mt-5 space-y-4">
            {parsed.warnings.length ? (
              <Alert tone="warning" title="Check before saving">
                <ul className="list-disc space-y-1 pl-4">
                  {parsed.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-2">
                <span className="font-semibold tabular">{parsed.sections.length}</span> sections found · <span className="tabular">{selected.length}</span> selected:{" "}
                <span className="tabular">{counts.added}</span> new, <span className="tabular">{counts.changed}</span> changed,{" "}
                <span className="tabular">{counts.unchanged}</span> unchanged
              </p>
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
                <Checkbox
                  checked={skip.size === 0}
                  onChange={(e) => setSkip(e.target.checked ? new Set() : new Set(parsed.sections.map((s) => s.sectionNo)))}
                />
                Select all
              </label>
            </div>
            <ol className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-lg border border-border scrollbar-thin">
              {parsed.sections.map((s) => {
                const on = !skip.has(s.sectionNo);
                return (
                  <li key={s.sectionNo}>
                    <label className="flex min-h-14 cursor-pointer items-start gap-3 px-3 py-2.5">
                      <Checkbox
                        className="mt-1"
                        checked={on}
                        onChange={(e) =>
                          setSkip((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.delete(s.sectionNo);
                            else next.add(s.sectionNo);
                            return next;
                          })
                        }
                        aria-label={`Include section ${s.sectionNo}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-primary tabular">s. {s.sectionNo}</span>
                          <span className="text-sm font-medium text-ink">{s.heading}</span>
                          {status.get(s.sectionNo) === "new" ? (
                            <Badge tone="success" dot>
                              New
                            </Badge>
                          ) : status.get(s.sectionNo) === "changed" ? (
                            <Badge tone="warning" dot>
                              Changed
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Unchanged</Badge>
                          )}
                        </span>
                        {s.chapter ? <span className="block text-xs text-muted">{s.chapter}</span> : null}
                        <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-2">{s.text}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ol>
            {missing.length ? (
              <Alert tone={unsafe ? "warning" : "info"} title={`${missing.length} ${missing.length === 1 ? "section is" : "sections are"} not in the pasted text`}>
                <p className="tabular">s. {listSectionNos(missing, 12)}</p>
                {unsafe ? (
                  <p className="mt-1">{unsafe} They are kept; remove sections one by one in the list above if they were really omitted.</p>
                ) : (
                  <label className="mt-2 flex min-h-11 items-center gap-2 text-ink-2">
                    <Checkbox checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} />
                    Remove {missing.length === 1 ? "it" : "them"} too (kept in the history)
                  </label>
                )}
              </Alert>
            ) : null}
            <Field label="Change note" htmlFor="paste-note" required hint="Recorded on every section saved, e.g. “Text from India Code, as amended to 1 Nov 2026”.">
              <Input id="paste-note" value={note} onChange={(e) => setNote(e.target.value)} minLength={5} maxLength={500} autoComplete="off" />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" disabled={toSave.length + removing.length === 0 || saving} onClick={save}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {toSave.length + removing.length === 0
                  ? "Nothing to save"
                  : `Save ${toSave.length} ${toSave.length === 1 ? "section" : "sections"}${removing.length ? `, remove ${removing.length}` : ""}`}
              </Button>
              {progress ? (
                <span className="text-sm text-muted tabular" role="status">
                  {progress.done} of {progress.total} saved
                </span>
              ) : null}
            </div>
            {progress ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }} />
              </div>
            ) : null}
            {result ? (
              <Alert tone="success" title="Saved">
                {result.added} added, {result.changed} changed, {result.removed} removed, {result.unchanged} unchanged. Each change is in History with your note.
              </Alert>
            ) : null}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
