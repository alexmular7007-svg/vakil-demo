import { diffDays, plural, type IsoDate } from "./dates";

/** How close a deadline is, relative to today (IST). */
export type Urgency = "open" | "soon" | "today" | "passed";

export const SOON_WITHIN_DAYS = 7;

export function urgencyOf(lastDate: IsoDate, today: IsoDate, soonWithin = SOON_WITHIN_DAYS): { daysLeft: number; urgency: Urgency } {
  const daysLeft = diffDays(today, lastDate);
  const urgency: Urgency = daysLeft < 0 ? "passed" : daysLeft === 0 ? "today" : daysLeft <= soonWithin ? "soon" : "open";
  return { daysLeft, urgency };
}

/** Badge tone for an urgency: within time = success, today/soon = warning, passed = danger. */
export const urgencyTone = { open: "success", soon: "warning", today: "warning", passed: "danger" } as const satisfies Record<Urgency, string>;

export function urgencyLabel(u: Urgency): string {
  return { open: "Within time", soon: "Due soon", today: "Last day today", passed: "Time-barred" }[u];
}

/** "12 days left", "Last day is today", "3 days overdue". */
export function daysLeftText(daysLeft: number): string {
  if (daysLeft === 0) return "Last day is today";
  return daysLeft > 0 ? `${plural(daysLeft, "day")} left` : `${plural(-daysLeft, "day")} overdue`;
}
