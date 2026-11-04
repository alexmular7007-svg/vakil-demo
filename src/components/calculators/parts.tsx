"use client";

import { useId } from "react";
import { toast } from "sonner";
import { AlertTriangle, Calculator, Copy, Info, Landmark, XCircle } from "lucide-react";
import type { CalcNote, WorkingStep } from "@/lib/calculators/limitation";
import { MAX_DATE, MIN_DATE } from "@/lib/calculators/dates";
import { Badge, Card } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export type ChipTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Labelled native date input (YYYY-MM-DD, no time zone involved). */
export function DateField({
  label,
  value,
  onChange,
  hint,
  required,
  min = MIN_DATE,
  max = MAX_DATE,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: React.ReactNode;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} required={required} className={className}>
      <Input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} className="tabular" required={required} />
    </Field>
  );
}

/** Pill radio group, 44px tall on phones. */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex w-full rounded-full bg-surface-2 p-1 sm:w-auto", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 flex-1 cursor-pointer rounded-full px-4 text-sm font-semibold transition-colors sm:min-h-9 sm:flex-none",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled checkbox row with a 44px tap target. */
export function CheckRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] py-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-border-input accent-[var(--primary)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/** The one brand surface on a calculator screen: the main result. */
export function ResultHero({
  eyebrow,
  value,
  caption,
  chip,
  children,
}: {
  eyebrow: React.ReactNode;
  value: React.ReactNode;
  caption?: React.ReactNode;
  chip?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section aria-live="polite" className="brand-surface overflow-hidden rounded-lg p-5 shadow-sm sm:p-6">
      <p className="text-[11px] font-bold tracking-[0.16em] text-gold-bright uppercase">{eyebrow}</p>
      <p className="mt-2 font-serif text-[30px] leading-tight font-semibold tracking-tight text-on-brand tabular sm:text-[38px]">{value}</p>
      {caption || chip ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chip}
          {caption ? <span className="text-sm text-on-brand-muted tabular">{caption}</span> : null}
        </div>
      ) : null}
      {children ? <div className="mt-4 border-t border-on-brand/15 pt-4 text-sm leading-relaxed text-on-brand-muted">{children}</div> : null}
    </section>
  );
}

/** Placeholder shown until the inputs are complete. */
export function ResultPlaceholder({ title, body, errors }: { title: string; body: string; errors?: string[] }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface/60 p-6 text-center">
      <span className="mb-3 inline-flex size-11 items-center justify-center rounded-[14px] bg-primary-soft text-primary">
        <Calculator className="size-5" aria-hidden />
      </span>
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {errors && errors.length > 0 ? (
        <ul className="mt-3 space-y-1 text-left text-[13px] text-danger" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function stepsAsText(title: string, steps: WorkingStep[], footer?: string) {
  const lines = [title, ""];
  steps.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.title}${s.cite ? ` [${s.cite}]` : ""}`);
    if (s.detail) lines.push(`   ${s.detail}`);
  });
  if (footer) lines.push("", footer);
  return lines.join("\n");
}

/** Numbered working, with a button to copy it as plain text. */
export function WorkingCard({ steps, copyTitle, copyFooter }: { steps: WorkingStep[]; copyTitle: string; copyFooter?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stepsAsText(copyTitle, steps, copyFooter));
      toast.success("Working copied");
    } catch {
      toast.error("Could not copy. Select the text instead.");
    }
  };
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">How this was worked out</h2>
        <Button type="button" variant="ghost" size="sm" onClick={copy} className="min-h-11 sm:min-h-9">
          <Copy aria-hidden /> Copy
        </Button>
      </div>
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={`${i}-${s.title}`} className="flex gap-3">
            <span
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-bold text-primary tabular"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-ink tabular">{s.title}</p>
              {s.detail ? <p className="mt-1 text-sm leading-relaxed text-ink-2 tabular">{s.detail}</p> : null}
              {s.cite ? <p className="mt-1 text-xs font-medium text-accent">{s.cite}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

const noteIcon = { info: Info, warning: AlertTriangle, danger: XCircle };
const noteTone = { info: "text-info", warning: "text-warning", danger: "text-danger" };

/** Points the advocate must weigh: notes, never computations. */
export function NotesCard({ notes, title = "Check before filing" }: { notes: CalcNote[]; title?: string }) {
  if (notes.length === 0) return null;
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-[15px] font-bold tracking-tight text-ink">{title}</h2>
      <ul className="divide-y divide-border">
        {notes.map((n) => {
          const Icon = noteIcon[n.tone];
          return (
            <li key={n.title + n.body.slice(0, 24)} className="flex gap-3 py-3">
              <Icon className={cn("mt-0.5 size-4 shrink-0", noteTone[n.tone])} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{n.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{n.body}</p>
                {n.cite ? <p className="mt-1 text-xs font-medium text-accent">{n.cite}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Status chip with a dot. */
export function StatusChip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return (
    <Badge tone={tone} dot className="tabular">
      {children}
    </Badge>
  );
}

/** Source line + the standard legal-information disclaimer. */
export function CalculatorDisclaimer({ sources, extra }: { sources: React.ReactNode; extra?: string }) {
  return (
    <aside aria-label="Sources and disclaimer" className="rounded-lg border border-border bg-surface-2/60 p-4 text-[13px] leading-relaxed text-muted">
      <p className="flex items-start gap-2 text-ink-2">
        <Landmark className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>{sources}</span>
      </p>
      {extra ? <p className="mt-2 font-semibold text-ink">{extra}</p> : null}
      <p className="mt-2">
        A calculation aid, not legal advice. Check the result against the statute, current case law and your court&apos;s holiday list before relying on it.{" "}
        {site.disclaimer}
      </p>
    </aside>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
      {children}
    </a>
  );
}
