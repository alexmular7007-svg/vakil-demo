"use client";

import { useId, useState, useTransition } from "react";
import { Briefcase, ChevronDown, Loader2, Quote } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { createHearing, updateHearing } from "@/app/app/diary/actions";
import { formatYmd } from "@/lib/diary/dates";
import { draftFromHearing, matterPrefill } from "@/lib/diary/drafts";
import type { HearingDraft, HearingItem, MatterOption } from "@/lib/diary/types";
import { cn } from "@/lib/utils";
import { PurposeChips } from "./purpose-chips";

/** Shown on the form when the values came from the AI reading an order. */
export type AiNote = { evidence: string | null; evidenceFound: boolean; notes: string[] };

export type FormState =
  | { key: number; mode: "new"; draft: HearingDraft; ai?: AiNote }
  | { key: number; mode: "edit"; hearing: HearingItem }
  | null;

export function HearingFormDialog({
  state,
  matters,
  fixedMatter,
  onClose,
  afterSave,
}: {
  state: FormState;
  matters: MatterOption[];
  fixedMatter?: MatterOption;
  onClose: () => void;
  afterSave: (date?: string | null) => void;
}) {
  const editing = state?.mode === "edit";
  return (
    <Dialog
      open={Boolean(state)}
      onClose={onClose}
      title={editing ? "Edit hearing" : "Add hearing"}
      description={editing ? "Changes apply to this date only." : "Add a listed date to your diary."}
      className="w-[min(100%-2rem,40rem)]"
    >
      {state ? (
        <HearingForm
          key={state.key}
          state={state}
          matters={matters}
          fixedMatter={fixedMatter}
          onCancel={onClose}
          onSaved={(date) => {
            onClose();
            afterSave(date);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function HearingForm({
  state,
  matters,
  fixedMatter,
  onCancel,
  onSaved,
}: {
  state: NonNullable<FormState>;
  matters: MatterOption[];
  fixedMatter?: MatterOption;
  onCancel: () => void;
  onSaved: (date: string) => void;
}) {
  const initial = state.mode === "edit" ? draftFromHearing(state.hearing) : state.draft;
  const [v, setV] = useState<HearingDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>();
  const [more, setMore] = useState(Boolean(initial.caseNo || initial.cnr || initial.notes));
  const [pending, start] = useTransition();
  const uid = useId();
  const f = (name: keyof HearingDraft) => `${uid}-${name}`;
  const set = (k: keyof HearingDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));
  const err = (k: keyof HearingDraft) => errors?.[k];
  const ai = state.mode === "new" ? state.ai : undefined;
  const lockedMatter = fixedMatter && (!v.matterId || v.matterId === fixedMatter.id) ? fixedMatter : null;

  const pickMatter = (id: string) => {
    const m = matters.find((x) => x.id === id);
    setV((p) => ({ ...p, matterId: id, ...(m ? matterPrefill(m) : {}) }));
    if (m?.caseNo || m?.cnr) setMore(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = state.mode === "edit" ? await updateHearing(state.hearing.id, v) : await createHearing(v);
      if (!r.ok) {
        setErrors(r.fieldErrors);
        if (r.fieldErrors && ["caseNo", "cnr", "notes"].some((k) => r.fieldErrors?.[k])) setMore(true);
        toast.error(r.error);
        return;
      }
      toast.success(state.mode === "edit" ? "Hearing updated" : `Added to ${formatYmd(r.data.hearingDate, { weekday: "short", day: "numeric", month: "short" })}`);
      onSaved(r.data.hearingDate);
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {ai ? <AiBanner ai={ai} /> : null}

      {lockedMatter ? (
        <p className="flex items-center gap-2 rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2">
          <Briefcase className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 truncate">
            Matter: <span className="font-semibold text-ink" data-private>{lockedMatter.title}</span>
          </span>
        </p>
      ) : matters.length > 0 ? (
        <Field label="Matter" htmlFor={f("matterId")} error={err("matterId")} hint="Picking a matter fills in the case details.">
          <Select id={f("matterId")} value={v.matterId} onChange={(e) => pickMatter(e.target.value)}>
            <option value="">No matter (one-off entry)</option>
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
                {m.clientName ? ` · ${m.clientName}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Field label="Case title" htmlFor={f("caseTitle")} required error={err("caseTitle")} className="col-span-2">
          <Input
            id={f("caseTitle")}
            value={v.caseTitle}
            onChange={set("caseTitle")}
            required
            maxLength={200}
            autoComplete="off"
            placeholder="e.g. Sharma v. State of UP"
            aria-invalid={Boolean(err("caseTitle"))}
          />
        </Field>
        <Field label="Date" htmlFor={f("hearingDate")} required error={err("hearingDate")}>
          <Input
            id={f("hearingDate")}
            type="date"
            value={v.hearingDate}
            onChange={set("hearingDate")}
            required
            aria-invalid={Boolean(err("hearingDate"))}
            className="min-w-0"
          />
        </Field>
        <Field label="Time" htmlFor={f("hearingTime")} error={err("hearingTime")}>
          <Input
            id={f("hearingTime")}
            type="time"
            step={300}
            value={v.hearingTime}
            onChange={set("hearingTime")}
            aria-invalid={Boolean(err("hearingTime"))}
            className="min-w-0"
          />
        </Field>
        <Field label="Court" htmlFor={f("court")} error={err("court")} className="col-span-2">
          <Input id={f("court")} value={v.court} onChange={set("court")} maxLength={200} autoComplete="off" placeholder="e.g. District Court, Saket" />
        </Field>
        <Field label="Bench / court hall" htmlFor={f("bench")} error={err("bench")}>
          <Input id={f("bench")} value={v.bench} onChange={set("bench")} maxLength={120} autoComplete="off" placeholder="e.g. Court 12" />
        </Field>
        <Field label="Item no." htmlFor={f("itemNo")} error={err("itemNo")}>
          <Input id={f("itemNo")} value={v.itemNo} onChange={set("itemNo")} maxLength={20} autoComplete="off" placeholder="e.g. 14" className="tabular" />
        </Field>
        <Field label="Purpose / stage" htmlFor={f("purpose")} error={err("purpose")} className="col-span-2">
          <Input id={f("purpose")} value={v.purpose} onChange={set("purpose")} maxLength={120} autoComplete="off" placeholder="e.g. Arguments" />
          <PurposeChips value={v.purpose} onPick={(p) => setV((s) => ({ ...s, purpose: s.purpose === p ? "" : p }))} />
        </Field>
      </div>

      <div className="rounded-[14px] border border-border">
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 px-3.5 text-sm font-semibold text-ink-2"
        >
          Case number, CNR and notes
          <ChevronDown className={cn("size-4 text-muted transition-transform", more && "rotate-180")} aria-hidden />
        </button>
        {more ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 border-t border-border p-3.5">
            <Field label="Case number" htmlFor={f("caseNo")} error={err("caseNo")}>
              <Input id={f("caseNo")} value={v.caseNo} onChange={set("caseNo")} maxLength={120} autoComplete="off" className="tabular" />
            </Field>
            <Field label="CNR" htmlFor={f("cnr")} error={err("cnr")}>
              <Input
                id={f("cnr")}
                value={v.cnr}
                onChange={set("cnr")}
                maxLength={24}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="16 characters"
                className="tabular uppercase placeholder:normal-case"
                aria-invalid={Boolean(err("cnr"))}
              />
            </Field>
            <Field label="Notes" htmlFor={f("notes")} error={err("notes")} className="col-span-2">
              <Textarea id={f("notes")} value={v.notes} onChange={set("notes")} maxLength={2000} rows={3} placeholder="Papers to carry, counsel to brief…" />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="sticky -bottom-4 -mx-5 -mb-4 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} className="min-w-32">
          {pending ? <Loader2 className="animate-spin" /> : null} {state.mode === "edit" ? "Save changes" : "Add to diary"}
        </Button>
      </div>
    </form>
  );
}

function AiBanner({ ai }: { ai: AiNote }) {
  return (
    <div className="rounded-[14px] border border-accent/30 bg-accent-soft p-3.5 text-sm text-ink-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">AI draft</Badge>
        <span className="font-semibold text-ink">Read from the order. Check every field before saving.</span>
      </div>
      {ai.evidence ? (
        <figure className="mt-2.5 flex gap-2">
          <Quote className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0">
            <blockquote className="italic">{ai.evidence}</blockquote>
            <figcaption className={cn("mt-1 text-xs font-semibold", ai.evidenceFound ? "text-success" : "text-warning")}>
              {ai.evidenceFound ? "This quote appears word for word in the order." : "This quote was not found word for word in the order. Check the date carefully."}
            </figcaption>
          </div>
        </figure>
      ) : null}
      {ai.notes.length ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
          {ai.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
