// Display helpers for hearings. Pure and safe for client and server.
import { formatTime, formatYmd } from "./dates";
import type { HearingStatus } from "./types";

/** Quick-pick stages offered on the hearing and outcome forms. */
export const PURPOSES = ["Arguments", "Evidence", "Framing of charge", "Bail", "Admission", "Orders", "Mention", "Cross-examination"] as const;

export type ChipTone = "info" | "warning" | "success" | "danger" | "neutral";

/** Status chip per design system v2: info = listed, warning = adjourned/pending, success = done. */
export function hearingStatusChip(h: { status: HearingStatus; hearingDate: string }, today: string): { label: string; tone: ChipTone } {
  switch (h.status) {
    case "done":
      return { label: "Done", tone: "success" };
    case "adjourned":
      return { label: "Adjourned", tone: "warning" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    default:
      if (h.hearingDate === today) return { label: "Listed today", tone: "info" };
      if (h.hearingDate < today) return { label: "Outcome pending", tone: "warning" };
      return { label: "Scheduled", tone: "info" };
  }
}

/** Due-date chip for a task. */
export function taskDueChip(dueDate: string | null, done: boolean, today: string): { label: string; tone: ChipTone } | null {
  if (!dueDate) return null;
  const short = formatYmd(dueDate, { day: "numeric", month: "short" });
  if (done) return { label: `Due ${short}`, tone: "neutral" };
  if (dueDate < today) return { label: `Overdue · ${short}`, tone: "danger" };
  if (dueDate === today) return { label: "Due today", tone: "warning" };
  return { label: `Due ${short}`, tone: "neutral" };
}

type HearingText = {
  caseTitle: string;
  court?: string | null;
  bench?: string | null;
  itemNo?: string | null;
  hearingTime?: string | null;
  hearingDate: string;
  purpose?: string | null;
  caseNo?: string | null;
  cnr?: string | null;
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** "Sharma v. State (Arguments)" */
export function hearingSummary(h: HearingText): string {
  const purpose = clean(h.purpose);
  return purpose ? `${clean(h.caseTitle)} (${purpose})` : clean(h.caseTitle);
}

/** "Sessions Court, Lucknow · Court hall 3" */
export function hearingLocation(h: HearingText): string {
  return [clean(h.court), clean(h.bench)].filter(Boolean).join(" · ");
}

/** Multi-line description used for calendar events. */
export function hearingDescription(h: HearingText): string {
  const lines = [
    clean(h.itemNo) ? `Item no. ${clean(h.itemNo)}` : "",
    clean(h.purpose) ? `Purpose: ${clean(h.purpose)}` : "",
    clean(h.caseNo) ? `Case no. ${clean(h.caseNo)}` : "",
    clean(h.cnr) ? `CNR: ${clean(h.cnr)}` : "",
    "From the Vaakil AI case diary",
  ];
  return lines.filter(Boolean).join("\n");
}

/** "Next date in X is Tuesday, 4 November 2026 before Y, court hall 3, item no. 14, at 10:30 am, for Arguments." */
export function whatsappMessage(h: HearingText): string {
  const date = formatYmd(h.hearingDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  let s = `Next date in ${clean(h.caseTitle)} is ${date}`;
  const where = [clean(h.court), clean(h.bench)].filter(Boolean).join(", ");
  if (where) s += ` before ${where}`;
  if (clean(h.itemNo)) s += `, item no. ${clean(h.itemNo)}`;
  const time = formatTime(h.hearingTime);
  if (time) s += `, at ${time}`;
  if (clean(h.purpose)) s += `, for ${clean(h.purpose)}`;
  s += ".";
  if (clean(h.caseNo)) s += `\nCase no. ${clean(h.caseNo)}`;
  if (clean(h.cnr)) s += `\nCNR: ${clean(h.cnr)}`;
  return s;
}

/** Short "Tue, 4 Nov · 10:30 am · Item 14" line. */
export function whenLine(h: { hearingDate: string; hearingTime: string | null; itemNo: string | null }, opts?: { withDate?: boolean }): string {
  return [
    opts?.withDate === false ? "" : formatYmd(h.hearingDate, { weekday: "short", day: "numeric", month: "short" }),
    formatTime(h.hearingTime) ?? "",
    clean(h.itemNo) ? `Item ${clean(h.itemNo)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
