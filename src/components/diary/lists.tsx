"use client";

import { CalendarDays, CalendarPlus } from "lucide-react";
import { Badge, Card, CardDescription, CardHeader, EmptyState } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { formatYmd, groupByDate, relativeDay } from "@/lib/diary/dates";
import type { HearingItem } from "@/lib/diary/types";
import { useDiary } from "./diary-provider";
import { HearingRow } from "./hearing-row";

/** Same look as CardTitle, as an h2 (card titles here are page sections). */
export const cardTitle = "text-[15px] font-bold tracking-tight text-ink";

/** The selected day's board. */
export function DayList({ date, items }: { date: string; items: HearingItem[] }) {
  const { newHearing, today } = useDiary();
  const rel = relativeDay(date, today);
  const active = items.filter((h) => h.status !== "cancelled").length;
  return (
    <section aria-labelledby="diary-day">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="diary-day" className="flex flex-wrap items-center gap-2 text-[15px] font-bold tracking-tight text-ink">
            {formatYmd(date, { weekday: "long", day: "numeric", month: "long" })}
            {rel ? <Badge tone={rel === "Today" ? "info" : "neutral"}>{rel}</Badge> : null}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted tabular">
            {items.length === 0 ? "Nothing listed" : `${active} listed${items.length > active ? ` · ${items.length - active} cancelled` : ""}`}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => newHearing({ hearingDate: date })} className="h-11 sm:h-9">
          <CalendarPlus /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={rel === "Today" ? "Nothing listed today" : "Nothing listed"}
          description={`No hearings in your diary for ${formatYmd(date, { weekday: "short", day: "numeric", month: "short" })}.`}
          action={
            <Button onClick={() => newHearing({ hearingDate: date })}>
              <CalendarPlus /> Add hearing
            </Button>
          }
          className="py-10"
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {items.map((h) => (
              <li key={h.id}>
                <HearingRow h={h} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/** Next 30 days, grouped by date. */
export function UpcomingList({ items }: { items: HearingItem[] }) {
  const { today } = useDiary();
  const groups = groupByDate(items);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-baseline justify-between gap-3">
        <h2 className={cardTitle}>Upcoming</h2>
        <span className="text-xs font-semibold text-muted">Next 30 days</span>
      </CardHeader>
      {groups.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">Nothing listed in the next 30 days.</p>
      ) : (
        <div>
          {groups.map((g) => {
            const rel = relativeDay(g.date, today);
            return (
              <section key={g.date} aria-label={formatYmd(g.date, { weekday: "long", day: "numeric", month: "long" })}>
                <p className="flex items-center justify-between border-y border-border bg-surface-2/60 px-4 py-1.5 text-xs font-bold text-ink-2 tabular sm:px-5">
                  <span>
                    {formatYmd(g.date, { weekday: "short", day: "numeric", month: "short" })}
                    {rel ? <span className="font-semibold text-primary"> · {rel}</span> : null}
                  </span>
                  <span className="font-semibold text-muted">{g.items.length}</span>
                </p>
                <ul className="divide-y divide-border">
                  {g.items.map((h) => (
                    <li key={h.id}>
                      <HearingRow h={h} showStatus={false} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Past dates still marked scheduled: prompt to record what happened. */
export function AwaitingOutcome({ items, total }: { items: HearingItem[]; total: number }) {
  if (items.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <h2 className={cardTitle}>Needs an outcome</h2>
          <Badge tone="warning" dot className="tabular">
            {total}
          </Badge>
        </div>
        <CardDescription>Record what happened so the next date is in your diary.</CardDescription>
      </CardHeader>
      <ul className="divide-y divide-border border-t border-border">
        {items.map((h) => (
          <li key={h.id}>
            <HearingRow h={h} lead="date" mode="outcome" showStatus={false} />
          </li>
        ))}
      </ul>
      {total > items.length ? <p className="border-t border-border px-5 py-3 text-xs text-muted tabular">and {total - items.length} older</p> : null}
    </Card>
  );
}
