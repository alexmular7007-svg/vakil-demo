// Days between two dates, and a date plus or minus a period.
//
// By default the first day is excluded and the last included, which is how
// "from ... to" reads in Central Acts (s. 9, General Clauses Act, 1897) and how
// s. 12(1) of the Limitation Act counts. Users can choose to count both ends.

import {
  addDays,
  addPeriod,
  calendarSpan,
  describePeriod,
  diffDays,
  formatDay,
  formatDayLong,
  isSupportedDate,
  plural,
  type IsoDate,
  type PeriodUnit,
} from "./dates";
import type { WorkingStep } from "./limitation";

export const MAX_AMOUNT: Record<PeriodUnit, number> = { days: 36_500, months: 1_200, years: 100 };

export type BetweenResult =
  | { ok: false; errors: string[] }
  | {
      ok: true;
      from: IsoDate;
      to: IsoDate;
      /** True when the dates were entered in reverse order and swapped. */
      swapped: boolean;
      days: number;
      weeks: number;
      weekRemainder: number;
      span: { years: number; months: number; days: number };
      steps: WorkingStep[];
    };

export function daysBetween(a: string, b: string, opts: { includeFirstDay?: boolean } = {}): BetweenResult {
  const errors: string[] = [];
  if (!isSupportedDate(a)) errors.push("Enter a valid first date.");
  if (!isSupportedDate(b)) errors.push("Enter a valid second date.");
  if (errors.length) return { ok: false, errors };
  const swapped = b < a;
  const from = swapped ? b : a;
  const to = swapped ? a : b;
  const base = diffDays(from, to);
  const days = base + (opts.includeFirstDay ? 1 : 0);
  const span = calendarSpan(from, opts.includeFirstDay ? addDays(to, 1) : to);
  const steps: WorkingStep[] = [];
  if (swapped) steps.push({ title: "Dates swapped", detail: `The second date is earlier, so the count runs from ${formatDay(from)} to ${formatDay(to)}.` });
  steps.push({
    title: `${plural(base, "day")} from ${formatDay(from)} to ${formatDay(to)}`,
    detail: "Calendar days, excluding the first day and including the last.",
    cite: "s. 9, General Clauses Act, 1897",
  });
  if (opts.includeFirstDay) steps.push({ title: `${plural(days, "day")} counting both days`, detail: `Adding the first day, ${formatDay(from)}, gives ${plural(days, "day")}.` });
  return { ok: true, from, to, swapped, days, weeks: Math.floor(days / 7), weekRemainder: days % 7, span, steps };
}

export type ShiftResult =
  | { ok: false; errors: string[] }
  | { ok: true; result: IsoDate; clamped: boolean; steps: WorkingStep[] };

/**
 * `date` plus (or minus) a period. With `includeFirstDay`, the given date counts
 * as day one, so the result is one day earlier when adding (later when subtracting).
 */
export function shiftDate(
  date: string,
  amount: number,
  unit: PeriodUnit,
  opts: { direction?: "add" | "subtract"; includeFirstDay?: boolean } = {},
): ShiftResult {
  const errors: string[] = [];
  if (!isSupportedDate(date)) errors.push("Enter a valid date.");
  if (!Number.isInteger(amount) || amount < 0) errors.push("Enter a whole number of days, months or years.");
  else if (amount > MAX_AMOUNT[unit]) errors.push(`Enter at most ${MAX_AMOUNT[unit].toLocaleString("en-IN")} ${unit}.`);
  if (errors.length) return { ok: false, errors };

  const sign = opts.direction === "subtract" ? -1 : 1;
  const moved = addPeriod(date, { amount: sign * amount, unit });
  let result = moved.date;
  const steps: WorkingStep[] = [];
  const period = describePeriod({ amount, unit });
  steps.push({
    title: `${sign > 0 ? "Adding" : "Subtracting"} ${period} ${sign > 0 ? "to" : "from"} ${formatDay(date)} gives ${formatDay(result)}`,
    detail:
      unit === "days"
        ? "Calendar days, with the given date itself not counted."
        : "Months and years follow the British calendar and land on the corresponding date." +
          (moved.clamped ? " That month has no such day, so the result is the month's last day." : ""),
    cite: unit === "days" ? "s. 9, General Clauses Act, 1897" : "s. 3(35) and (66), General Clauses Act, 1897",
  });
  if (opts.includeFirstDay && amount > 0) {
    result = addDays(result, -sign);
    steps.push({
      title: `Counting ${formatDay(date)} as day one: ${formatDay(result)}`,
      detail: "Because the given date is counted, the period ends one day sooner.",
    });
  }
  steps.push({ title: `Result: ${formatDayLong(result)}`, detail: "If this is a court holiday, check whether the act may be done on the next working day." });
  return { ok: true, result, clamped: moved.clamped, steps };
}
