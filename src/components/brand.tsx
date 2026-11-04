import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The Vaakil AI mark: an advocate's coat seen from the front. The gold lapels
 * form a "V" and the white bands sit inside it, on a court-navy tile.
 * Path data is shared with the generated app icons (src/app/icon.tsx).
 */
export const MARK = {
  tileFrom: "#1d3672",
  tileTo: "#0b1630",
  goldFrom: "#ecd197",
  goldTo: "#c29a45",
  band: "#f4efe3",
  lapels: "M12.5 13 24 36.5 35.5 13",
  collar: { x: 19.3, y: 10.4, width: 9.4, height: 2, rx: 1 },
  bands: [
    "M20.2 12h3.3l.25 11.4c0 .5-.4.9-.9.9h-2.1c-.5 0-.9-.4-.9-.9z",
    "M24.5 12h3.3l.35 11.4c0 .5-.4.9-.9.9h-2.1c-.5 0-.9-.4-.9-.9z",
  ],
} as const;

export function LogoMark({ className, title }: { className?: string; title?: string }) {
  // Unique gradient ids: a hidden copy of the mark (e.g. inside a display:none
  // breakpoint wrapper) would otherwise blank out every later copy.
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 48 48" className={cn("size-9 shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={MARK.tileFrom} />
          <stop offset="1" stopColor={MARK.tileTo} />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MARK.goldFrom} />
          <stop offset="1" stopColor={MARK.goldTo} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${id}t)`} />
      <path d={MARK.lapels} fill="none" stroke={`url(#${id}g)`} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect {...MARK.collar} fill={MARK.band} />
      {MARK.bands.map((d) => (
        <path key={d} d={d} fill={MARK.band} />
      ))}
    </svg>
  );
}

export function Wordmark({ tone = "default", className }: { tone?: "default" | "onBrand"; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)}>
      <span className={cn("font-serif text-[21px] font-bold tracking-tight", tone === "onBrand" ? "text-on-brand" : "text-ink")}>
        Vaakil
      </span>
      <span
        className={cn(
          "rounded-[5px] px-1 py-px text-[10.5px] font-extrabold tracking-[0.14em]",
          tone === "onBrand" ? "bg-gold-bright/15 text-gold-bright" : "bg-accent-soft text-accent",
        )}
      >
        AI
      </span>
    </span>
  );
}

export function Logo({
  href = "/",
  className,
  compact,
  tone = "default",
}: {
  href?: string;
  className?: string;
  compact?: boolean;
  tone?: "default" | "onBrand";
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-md", className)} aria-label="Vaakil AI home">
      <LogoMark />
      {compact ? null : <Wordmark tone={tone} />}
    </Link>
  );
}
