"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, ChevronRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSection, loadSection, saveSection } from "@/app/admin/library/actions";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";

type Row = { sectionNo: string; heading: string; chapter: string | null };
type Editing = { mode: "add" } | { mode: "edit"; sectionNo: string };

/** Section list for one act with add / edit / remove, all through reviseSection on the server. */
export function SectionManager({ actId, rows }: { actId: string; rows: Row[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [loaded, setLoaded] = useState<{ heading: string; text: string; chapter: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const chapters = useMemo(() => [...new Set(rows.map((r) => r.chapter).filter((c): c is string => Boolean(c)))], [rows]);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) => r.sectionNo.toLowerCase() === f.replace(/^s(ec(tion)?)?\.?\s*/, "") || r.heading.toLowerCase().includes(f) || r.sectionNo.toLowerCase().startsWith(f));
  }, [rows, filter]);
  const groups = useMemo(() => {
    const out: { chapter: string; items: Row[] }[] = [];
    for (const r of shown) {
      const key = r.chapter ?? "Sections";
      const last = out[out.length - 1];
      if (last && last.chapter === key) last.items.push(r);
      else out.push({ chapter: key, items: [r] });
    }
    return out;
  }, [shown]);

  function openEdit(sectionNo: string) {
    setEditing({ mode: "edit", sectionNo });
    setLoaded(null);
    setErrors({});
    setConfirmRemove(false);
    setLoading(true);
    loadSection({ actId, sectionNo }).then((res) => {
      setLoading(false);
      if (res.ok) setLoaded(res.data);
      else {
        toast.error(res.error);
        setEditing(null);
      }
    });
  }

  function openAdd() {
    setEditing({ mode: "add" });
    setLoaded({ heading: "", text: "", chapter: null });
    setErrors({});
    setConfirmRemove(false);
  }

  const close = () => {
    setEditing(null);
    setConfirmRemove(false);
  };

  return (
    <section aria-labelledby="sections-heading" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="sections-heading" className="text-[15px] font-bold tracking-tight text-ink">
          Sections <span className="font-normal text-muted tabular">({rows.length})</span>
        </h2>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <label htmlFor="section-filter" className="sr-only">
              Find a section
            </label>
            <Input id="section-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Number or heading" className="pl-9" />
          </div>
          <Button type="button" onClick={openAdd}>
            <Plus /> <span className="max-sm:sr-only">Add section</span>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={BookOpenText} title="No sections yet" description="Add sections one by one, or paste the whole act below." />
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">No section matches “{filter}”.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={`${g.chapter}-${g.items[0].sectionNo}`}>
              <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{g.chapter}</p>
              <Card>
                <ul className="divide-y divide-border">
                  {g.items.map((r) => (
                    <li key={r.sectionNo}>
                      <button
                        type="button"
                        onClick={() => openEdit(r.sectionNo)}
                        className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left hover:bg-surface-2/60"
                      >
                        <span className="w-14 shrink-0 font-mono text-sm font-semibold text-primary tabular">s. {r.sectionNo}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.heading}</span>
                        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}

      <datalist id={`chapters-${actId}`}>
        {chapters.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <Dialog
        open={editing !== null}
        onClose={close}
        title={editing?.mode === "edit" ? `Edit section ${editing.sectionNo}` : "Add a section"}
        description="Saved through the revision log: the before and after text and your note are kept in History."
        className="sm:w-[min(100%-2rem,44rem)]"
      >
        {loading || !loaded ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the section…
          </div>
        ) : (
          <form
            key={editing?.mode === "edit" ? `edit-${editing.sectionNo}` : "add"}
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing) return;
              const fd = new FormData(e.currentTarget);
              const s = (k: string) => String(fd.get(k) ?? "");
              const sectionNo = editing.mode === "edit" ? editing.sectionNo : s("sectionNo");
              start(async () => {
                const res = await saveSection({
                  actId,
                  sectionNo,
                  heading: s("heading"),
                  text: s("text"),
                  chapter: s("chapter"),
                  note: s("note"),
                  mode: editing.mode,
                });
                if (!res.ok) {
                  setErrors(res.fieldErrors ?? {});
                  toast.error(res.error);
                  return;
                }
                toast.success(res.data.result === "unchanged" ? "Nothing changed." : res.data.result === "added" ? `Section ${sectionNo} added.` : `Section ${sectionNo} updated.`);
                close();
                router.refresh();
              });
            }}
          >
            {editing?.mode === "add" ? (
              <Field label="Section number" htmlFor="sec-no" required error={errors.sectionNo} hint="For example 103, 498A or 3B.">
                <Input id="sec-no" name="sectionNo" required maxLength={8} autoCapitalize="characters" autoComplete="off" className="font-mono uppercase tabular" />
              </Field>
            ) : null}
            <Field label="Heading" htmlFor="sec-heading" required error={errors.heading}>
              <Input id="sec-heading" name="heading" required maxLength={500} defaultValue={loaded.heading} />
            </Field>
            <Field label="Chapter" htmlFor="sec-chapter" error={errors.chapter} hint="As stored, e.g. “Chapter VI: Of Offences Affecting the Human Body”.">
              <Input id="sec-chapter" name="chapter" maxLength={300} defaultValue={loaded.chapter ?? ""} list={`chapters-${actId}`} autoComplete="off" />
            </Field>
            <Field label="Text" htmlFor="sec-text" required error={errors.text} hint="Separate sub-sections, clauses, provisos and explanations with a blank line.">
              <Textarea id="sec-text" name="text" required rows={12} maxLength={100000} defaultValue={loaded.text} className="font-serif text-[15px] leading-relaxed" />
            </Field>
            <Field label="Change note" htmlFor="sec-note" required error={errors.note} hint="Why, with the source: e.g. “Substituted by Act 12 of 2026, s. 4 (Gazette 2 Nov 2026)”.">
              <Input id="sec-note" name="note" required minLength={5} maxLength={500} autoComplete="off" />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              {editing?.mode === "edit" ? (
                <Button type="button" variant="ghost" className="text-danger" onClick={() => setConfirmRemove((v) => !v)}>
                  <Trash2 /> Remove section
                </Button>
              ) : (
                <span />
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : null} Save
                </Button>
              </div>
            </div>
            {confirmRemove && editing?.mode === "edit" ? (
              <div className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm">
                <p className="font-medium text-ink">Remove section {editing.sectionNo}?</p>
                <p className="mt-1 text-ink-2">Use this when an amendment omits the section. Its last text stays in History. The change note above is required.</p>
                <Button
                  type="button"
                  variant="danger"
                  className="mt-3"
                  disabled={pending}
                  onClick={(e) => {
                    const form = e.currentTarget.form;
                    const note = form ? String(new FormData(form).get("note") ?? "") : "";
                    start(async () => {
                      const res = await deleteSection({ actId, sectionNo: editing.sectionNo, note });
                      if (!res.ok) {
                        setErrors(res.fieldErrors ?? {});
                        toast.error(res.error);
                        return;
                      }
                      toast.success(`Section ${editing.sectionNo} removed.`);
                      close();
                      router.refresh();
                    });
                  }}
                >
                  <Trash2 /> Remove section {editing.sectionNo}
                </Button>
              </div>
            ) : null}
          </form>
        )}
      </Dialog>
    </section>
  );
}
