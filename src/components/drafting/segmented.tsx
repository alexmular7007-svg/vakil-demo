"use client";

import { cn } from "@/lib/utils";

/** Small radio-style segmented control (language, view mode). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "md",
}: {
  options: { value: T; label: React.ReactNode; lang?: string; className?: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          lang={o.lang}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4",
            size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3 text-sm",
            value === o.value ? "bg-surface text-ink shadow-sm" : "hover:text-ink",
            o.className,
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
