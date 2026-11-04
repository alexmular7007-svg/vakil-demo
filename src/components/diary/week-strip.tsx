"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatYmd, rangeLabel } from "@/lib/diary/dates";
import { cn } from "@/lib/utils";

const href = (date: string) => `/app/diary?date=${date}`;

/**
 * Banking-app style week of day chips on the brand surface. Tap a day to see its
 * board; swipe sideways (phone) or use the arrows to change week.
 */
export function WeekStrip({
  selected,
  today,
  week,
  counts,
}: {
  selected: string;
  today: string;
  week: { date: string; count: number }[];
  counts: { today: number; week: number; overdueTasks: number };
}) {
  const router = useRouter();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const prev = addDays(selected, -7);
  const next = addDays(selected, 7);
  const showToday = selected !== today;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 56 && Math.abs(dy) < 40) router.push(href(dx < 0 ? next : prev), { scroll: false });
  };

  return (
    <section aria-label="Week" className="brand-surface overflow-hidden rounded-lg p-4 shadow-brand sm:p-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.16em] text-gold-bright uppercase">{week.some((d) => d.date === today) ? "This week" : "Week"}</p>
          <h2 className="truncate font-serif text-lg font-semibold text-on-brand sm:text-xl">{rangeLabel(week[0].date, week[6].date)}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {showToday ? (
            <Link
              href={href(today)}
              scroll={false}
              className="pressable inline-flex h-11 items-center rounded-full bg-on-brand/10 px-3.5 text-[13px] font-semibold text-on-brand hover:bg-on-brand/15 sm:h-10"
            >
              Today
            </Link>
          ) : null}
          <Link
            href={href(prev)}
            scroll={false}
            aria-label="Previous week"
            className="pressable inline-flex size-11 items-center justify-center rounded-full bg-on-brand/10 text-on-brand hover:bg-on-brand/15 sm:size-10"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <Link
            href={href(next)}
            scroll={false}
            aria-label="Next week"
            className="pressable inline-flex size-11 items-center justify-center rounded-full bg-on-brand/10 text-on-brand hover:bg-on-brand/15 sm:size-10"
          >
            <ChevronRight className="size-5" />
          </Link>
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-7 gap-1 sm:gap-2">
        {week.map((d) => {
          const isSel = d.date === selected;
          const isToday = d.date === today;
          const label = `${formatYmd(d.date, { weekday: "long", day: "numeric", month: "long" })}${isToday ? ", today" : ""}: ${
            d.count ? `${d.count} hearing${d.count === 1 ? "" : "s"}` : "no hearings"
          }`;
          return (
            <li key={d.date}>
              <Link
                href={href(d.date)}
                scroll={false}
                aria-label={label}
                aria-current={isSel ? "date" : undefined}
                className={cn(
                  "pressable flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[14px] py-2 transition-colors",
                  isSel ? "bg-gold-bright text-brand shadow-sm" : "text-on-brand hover:bg-on-brand/10",
                  !isSel && isToday && "ring-1 ring-gold-bright/70 ring-inset",
                )}
              >
                <span
                  className={cn(
                    "text-[10.5px] font-bold tracking-[0.06em] uppercase",
                    isSel ? "text-brand/75" : isToday ? "text-gold-bright" : "text-on-brand-muted",
                  )}
                >
                  {formatYmd(d.date, { weekday: "short" })}
                </span>
                <span className="text-lg leading-none font-bold tabular">{formatYmd(d.date, { day: "numeric" })}</span>
                <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                  {Array.from({ length: Math.min(d.count, 3) }, (_, i) => (
                    <span key={i} className={cn("size-1.5 rounded-full", isSel ? "bg-brand" : "bg-gold-bright")} />
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-on-brand/15 pt-3">
        <Stat label="Listed today" value={counts.today} />
        <Stat label="Next 7 days" value={counts.week} />
        <Stat label="Overdue tasks" value={counts.overdueTasks} highlight={counts.overdueTasks > 0} />
      </dl>
    </section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11.5px] font-semibold text-on-brand-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-xl leading-tight font-bold tabular", highlight ? "text-gold-bright" : "text-on-brand")}>{value}</dd>
    </div>
  );
}
