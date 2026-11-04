"use client";

import { cn } from "@/lib/utils";
import type { GstMode } from "@/lib/fees/money";

const options: { value: GstMode; title: string; body: string }[] = [
  {
    value: "none",
    title: "No GST",
    body: "Default. Legal services to individuals and non-business clients are generally exempt.",
  },
  {
    value: "reverse_charge",
    title: "Reverse charge",
    body: "Business client. The client pays the GST itself; the memo says so and nothing is added to the total.",
  },
  {
    value: "forward",
    title: "Charge GST",
    body: "Only if you are registered and choose to charge GST, for example as a firm. GST is added to the total.",
  },
];

export function GstModePicker({ value, onChange, name = "gstMode" }: { value: GstMode; onChange: (v: GstMode) => void; name?: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold text-ink-2">GST</legend>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-14 cursor-pointer gap-3 rounded-md border border-border-input/50 bg-surface p-3 transition-colors",
              "has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-4 has-focus-visible:ring-ring/15",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{o.title}</span>
              <span className="mt-0.5 block text-xs text-muted">{o.body}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
