"use client";

import { PURPOSES } from "@/lib/diary/format";
import { cn } from "@/lib/utils";

/** One-tap stage chips under the purpose field; a horizontal scroller on phones. */
export function PurposeChips({ value, onPick, label = "Quick pick a purpose" }: { value: string; onPick: (p: string) => void; label?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-5 mt-1 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {PURPOSES.map((p) => {
        const on = value.trim().toLowerCase() === p.toLowerCase();
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(p)}
            className={cn(
              "pressable inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap sm:h-9",
              on ? "border-primary bg-primary text-primary-ink" : "border-border-input/50 bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}
