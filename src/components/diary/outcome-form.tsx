"use client";

import { useId, useState, useTransition } from "react";
import { ArrowLeft, Ban, CheckCheck, Loader2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/form";
import { recordOutcome } from "@/app/app/diary/actions";
import { addDays, formatYmd } from "@/lib/diary/dates";
import { whatsappUrl } from "@/lib/diary/links";
import type { HearingItem } from "@/lib/diary/types";
import { cn } from "@/lib/utils";
import { PurposeChips } from "./purpose-chips";

type Outcome = "done" | "adjourned" | "cancelled";

const choices: { value: Outcome; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "adjourned", label: "Adjourned", icon: Repeat },
  { value: "done", label: "Done", icon: CheckCheck },
  { value: "cancelled", label: "Cancelled", icon: Ban },
];

const jumps = [
  { weeks: 1, label: "1 week" },
  { weeks: 2, label: "2 weeks" },
  { weeks: 4, label: "4 weeks" },
  { weeks: 8, label: "8 weeks" },
];

export function OutcomeForm({ hearing: h, onBack, onSaved }: { hearing: HearingItem; onBack: () => void; onSaved: (nextDate: string | null) => void }) {
  const [status, setStatus] = useState<Outcome>(h.status === "scheduled" ? "adjourned" : h.status);
  const [outcome, setOutcome] = useState(h.outcome ?? "");
  const [nextDate, setNextDate] = useState(h.nextHearingDate ?? "");
  const [nextTime, setNextTime] = useState("");
  const [nextPurpose, setNextPurpose] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>();
  const [pending, start] = useTransition();
  const uid = useId();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await recordOutcome({ id: h.id, status, outcome, nextDate, nextTime, nextPurpose });
      if (!r.ok) {
        setErrors(r.fieldErrors);
        toast.error(r.error);
        return;
      }
      const next = r.data.nextDate;
      if (next) {
        const share = whatsappUrl({ ...h, hearingDate: next, hearingTime: nextTime || null, purpose: nextPurpose || null, itemNo: null });
        toast.success(`Next date ${formatYmd(next, { weekday: "short", day: "numeric", month: "short" })} added to your diary`, {
          action: { label: "Tell client", onClick: () => window.open(share, "_blank", "noopener,noreferrer") },
        });
      } else {
        toast.success("Outcome saved");
      }
      onSaved(next);
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <div className="grid gap-1.5">
        <p id={`${uid}-status`} className="text-[13px] font-semibold text-ink-2">
          What happened
        </p>
        <div role="radiogroup" aria-labelledby={`${uid}-status`} className="grid grid-cols-3 gap-2">
          {choices.map((c) => {
            const on = status === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setStatus(c.value)}
                className={cn(
                  "pressable flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border px-1 text-[13px] font-semibold",
                  on ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-ink-2 hover:bg-surface-2",
                )}
              >
                <c.icon className="size-[18px]" aria-hidden />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <Field label="Proceedings (optional)" htmlFor={`${uid}-outcome`} error={errors?.outcome}>
        <Textarea
          id={`${uid}-outcome`}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={status === "adjourned" ? "e.g. Respondent sought time to file reply" : "e.g. Arguments concluded, orders reserved"}
        />
      </Field>

      <div className="grid gap-4 rounded-[14px] border border-border p-3.5">
        <div>
          <p className="text-sm font-bold text-ink">Next date</p>
          <p className="text-[13px] text-muted">
            {h.nextHearingId
              ? "Changing it moves the next date already in your diary."
              : "Adds the next date to your diary with the same case details. Leave empty if there is none."}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-next`}>Date</Label>
          <Input
            id={`${uid}-next`}
            type="date"
            value={nextDate}
            min={addDays(h.hearingDate, 1)}
            onChange={(e) => setNextDate(e.target.value)}
            aria-invalid={Boolean(errors?.nextDate)}
            className="min-w-0"
          />
          <div role="group" aria-label="Set the next date after" className="mt-1 grid grid-cols-4 gap-2">
            {jumps.map((j) => {
              const d = addDays(h.hearingDate, j.weeks * 7);
              const on = nextDate === d;
              return (
                <button
                  key={j.weeks}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setNextDate(d)}
                  className={cn(
                    "pressable flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-[12px] border px-1 py-1 text-center",
                    on ? "border-primary bg-primary text-primary-ink" : "border-border-input/50 bg-surface text-ink-2 hover:bg-surface-2",
                  )}
                >
                  <span className="text-[12.5px] font-semibold">{j.label}</span>
                  <span className={cn("text-[11px] tabular", on ? "text-primary-ink/80" : "text-muted")}>{formatYmd(d, { day: "numeric", month: "short" })}</span>
                </button>
              );
            })}
          </div>
          {errors?.nextDate ? (
            <p className="text-[13px] text-danger" role="alert">
              {errors.nextDate}
            </p>
          ) : null}
        </div>
        {nextDate ? (
          <>
            <Field label="Time (optional)" htmlFor={`${uid}-time`} error={errors?.nextTime}>
              <Input id={`${uid}-time`} type="time" step={300} value={nextTime} onChange={(e) => setNextTime(e.target.value)} className="max-w-48 min-w-0" />
            </Field>
            <Field label="Purpose on the next date" htmlFor={`${uid}-purpose`} error={errors?.nextPurpose}>
              <Input id={`${uid}-purpose`} value={nextPurpose} onChange={(e) => setNextPurpose(e.target.value)} maxLength={120} placeholder="e.g. Evidence" />
              <PurposeChips value={nextPurpose} onPick={(p) => setNextPurpose((s) => (s === p ? "" : p))} />
            </Field>
          </>
        ) : null}
      </div>

      <div className="sticky -bottom-4 -mx-5 -mb-4 flex items-center justify-between gap-2 border-t border-border bg-surface px-5 py-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <Button type="submit" disabled={pending} className="min-w-32">
          {pending ? <Loader2 className="animate-spin" /> : null} Save outcome
        </Button>
      </div>
    </form>
  );
}
