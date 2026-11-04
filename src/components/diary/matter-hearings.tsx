"use client";

import { useState } from "react";
import { CalendarPlus, Landmark } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { formatDayDate, relativeDay } from "@/lib/diary/dates";
import type { HearingItem, MatterOption } from "@/lib/diary/types";
import { useDiary } from "./diary-provider";
import { EcourtsLink } from "./ecourts";
import { HearingRow } from "./hearing-row";
import { matterPrefill } from "@/lib/diary/drafts";

const PAST_SHOWN = 5;

/** Hearings section of the matter page: CNR with eCourts, upcoming and past dates. */
export function MatterHearings({ matter, upcoming, past }: { matter: MatterOption; upcoming: HearingItem[]; past: HearingItem[] }) {
  const { newHearing, today } = useDiary();
  const [allPast, setAllPast] = useState(false);
  const next = upcoming.find((h) => h.status === "scheduled");
  const shownPast = allPast ? past : past.slice(0, PAST_SHOWN);
  const rel = next ? relativeDay(next.hearingDate, today) : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Hearings</h2>
          <p className="mt-0.5 text-sm text-muted tabular">
            {next ? `Next date ${formatDayDate(next.hearingDate)}${rel ? ` · ${rel}` : ""}` : "No upcoming date in the diary"}
          </p>
        </div>
        <Button variant="secondary" size="sm" className="h-11 sm:h-9" onClick={() => newHearing({ ...matterPrefill(matter), hearingDate: today })}>
          <CalendarPlus /> Add hearing
        </Button>
      </CardHeader>

      <div className="px-4 pb-4 sm:px-5">
        {matter.cnr ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface-2/70 px-3.5 py-3">
            <Landmark className="size-5 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">CNR</p>
              <p className="truncate text-[15px] font-semibold text-ink tabular">{matter.cnr}</p>
            </div>
            <EcourtsLink cnr={matter.cnr} court={matter.court} className="h-11 sm:h-9" />
          </div>
        ) : (
          <p className="rounded-[14px] bg-surface-2/70 px-3.5 py-3 text-[13px] text-muted">
            Add the 16-character CNR to this matter to open it on eCourts in one tap.
          </p>
        )}
      </div>

      {upcoming.length ? (
        <Group label="Upcoming">
          {upcoming.map((h) => (
            <li key={h.id}>
              <HearingRow h={h} lead="date" />
            </li>
          ))}
        </Group>
      ) : null}

      {past.length ? (
        <Group label="Past">
          {shownPast.map((h) => (
            <li key={h.id}>
              <HearingRow h={h} lead="date" subtitle={h.outcome ?? undefined} />
            </li>
          ))}
        </Group>
      ) : null}

      {past.length > PAST_SHOWN ? (
        <div className="border-t border-border px-4 py-2 sm:px-5">
          <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => setAllPast((v) => !v)}>
            {allPast ? "Show fewer" : `Show all ${past.length} past dates`}
          </Button>
        </div>
      ) : null}

      {upcoming.length === 0 && past.length === 0 ? (
        <p className="border-t border-border px-4 py-5 text-sm text-muted sm:px-5">No hearings yet. Add the next date to start this case&apos;s diary.</p>
      ) : null}
    </Card>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label}>
      <p className="border-y border-border bg-surface-2/60 px-4 py-1.5 text-xs font-bold text-ink-2 sm:px-5">{label}</p>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}
