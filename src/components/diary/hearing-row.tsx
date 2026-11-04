"use client";

import { ChevronRight, Gavel } from "lucide-react";
import { Badge, IconTile } from "@/components/ui/display";
import { formatTime, formatYmd } from "@/lib/diary/dates";
import { hearingLocation, hearingStatusChip } from "@/lib/diary/format";
import type { HearingItem } from "@/lib/diary/types";
import { cn } from "@/lib/utils";
import { useDiary } from "./diary-provider";
import type { DetailMode } from "./hearing-detail";

/**
 * One diary entry as a bank-transaction row: time (or date) tile, case title,
 * court line, chips, chevron. The whole row opens the hearing sheet.
 */
export function HearingRow({
  h,
  lead = "time",
  mode = "view",
  showStatus = true,
  subtitle,
}: {
  h: HearingItem;
  /** What the leading tile shows. */
  lead?: "time" | "date";
  mode?: DetailMode;
  showStatus?: boolean;
  /** Replaces the court line (e.g. the outcome on past hearings). */
  subtitle?: string | null;
}) {
  const { openHearing, today } = useDiary();
  const chip = hearingStatusChip(h, today);
  const time = formatTime(h.hearingTime);
  const line =
    subtitle ??
    [lead === "date" ? time : null, h.itemNo && (time || lead === "date") ? `Item ${h.itemNo}` : null, hearingLocation(h) || null].filter(Boolean).join(" · ");
  const chips = Boolean(h.purpose) || showStatus;

  return (
    <button
      type="button"
      onClick={() => openHearing(h, mode)}
      className="flex min-h-16 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/60 sm:px-5"
    >
      {lead === "date" ? <DateTile ymd={h.hearingDate} /> : <TimeTile time={h.hearingTime} itemNo={h.itemNo} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink" data-private>
          {h.caseTitle}
        </span>
        {line ? <span className="mt-0.5 block truncate text-[13px] text-muted tabular">{line}</span> : null}
        {chips ? (
          <span className={cn("mt-1.5 flex flex-wrap items-center gap-1.5", !h.purpose && "sm:hidden")}>
            {h.purpose ? <Badge tone="neutral">{h.purpose}</Badge> : null}
            {showStatus ? (
              <Badge tone={chip.tone} dot className="sm:hidden">
                {chip.label}
              </Badge>
            ) : null}
          </span>
        ) : null}
      </span>
      {showStatus ? (
        <Badge tone={chip.tone} dot className="hidden shrink-0 sm:inline-flex">
          {chip.label}
        </Badge>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
    </button>
  );
}

const tile = "flex size-14 shrink-0 flex-col items-center justify-center rounded-[14px] bg-(--tile-navy) px-1 text-(--tile-navy-fg)";

/** Leading tile: "10:30 / AM", or "ITEM / 14" when there is no time. */
export function TimeTile({ time, itemNo }: { time: string | null; itemNo: string | null }) {
  const t = formatTime(time);
  if (t) {
    const [clock, ampm] = t.split(" ");
    return (
      <span className={tile}>
        <span className="text-[15px] leading-none font-bold tabular">{clock}</span>
        <span className="mt-1 text-[10px] leading-none font-bold tracking-[0.08em] uppercase opacity-80">{ampm}</span>
      </span>
    );
  }
  if (itemNo) {
    return (
      <span className={tile}>
        <span className="text-[10px] leading-none font-bold tracking-[0.08em] uppercase opacity-80">Item</span>
        <span className="mt-1 max-w-full truncate text-[16px] leading-none font-bold tabular">{itemNo}</span>
      </span>
    );
  }
  return <IconTile icon={Gavel} tone="slate" size="lg" />;
}

/** Leading tile with the day and month, for lists that span dates. */
export function DateTile({ ymd }: { ymd: string }) {
  return (
    <span className={tile}>
      <span className="text-[10px] leading-none font-bold tracking-[0.08em] uppercase opacity-80">{formatYmd(ymd, { month: "short" })}</span>
      <span className="mt-1 text-[18px] leading-none font-bold tabular">{formatYmd(ymd, { day: "numeric" })}</span>
    </span>
  );
}
