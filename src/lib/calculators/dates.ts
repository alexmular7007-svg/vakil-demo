// Calendar-date arithmetic on plain "YYYY-MM-DD" strings.
//
// Legal deadlines are calendar dates, not instants, so nothing here touches a
// time zone: dates are converted to a whole-day number with Date.UTC and back.
// "Today" is the only clock read, and it is taken in IST (Asia/Kolkata).
//
// Months and years follow the British (Gregorian) calendar, as the General
// Clauses Act, 1897 defines them (s. 3(35) "month", s. 3(66) "year"). Adding a
// month or year lands on the corresponding date; when that month has no such
// date (31 January + 1 month), the result is the last day of the month and the
// result is marked `clamped` so the UI can say so.

export type IsoDate = string;
export type PeriodUnit = "days" | "months" | "years";
export type Period = { amount: number; unit: PeriodUnit };

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Earliest and latest dates the calculators accept. */
export const MIN_DATE = "1900-01-01";
export const MAX_DATE = "2200-12-31";

export function isLeapYear(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number) {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Parses a strict YYYY-MM-DD calendar date; null for anything else (including 2025-02-30). */
export function parseIsoDate(s: string | null | undefined): { y: number; m: number; d: number } | null {
  if (typeof s !== "string") return null;
  const match = ISO_RE.exec(s.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isIsoDate(s: string | null | undefined): s is IsoDate {
  return parseIsoDate(s) !== null;
}

/** True when the string is a valid date inside the supported range. */
export function isSupportedDate(s: string | null | undefined): s is IsoDate {
  return isIsoDate(s) && s >= MIN_DATE && s <= MAX_DATE;
}

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

export function toIso(y: number, m: number, d: number): IsoDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Whole days since 1970-01-01 (negative before). */
export function toDayNumber(date: IsoDate): number {
  const p = parseIsoDate(date);
  if (!p) throw new RangeError(`Not a valid date: ${date}`);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / MS_PER_DAY);
}

export function fromDayNumber(n: number): IsoDate {
  const dt = new Date(n * MS_PER_DAY);
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: IsoDate, n: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + n);
}

/** Calendar days from `a` to `b` (positive when b is later). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const minDate = (a: IsoDate, b: IsoDate) => (a <= b ? a : b);
export const maxDate = (a: IsoDate, b: IsoDate) => (a >= b ? a : b);

/** Corresponding date `n` months later (or earlier); clamps to the month's last day. */
export function addMonths(date: IsoDate, n: number): { date: IsoDate; clamped: boolean } {
  const p = parseIsoDate(date);
  if (!p) throw new RangeError(`Not a valid date: ${date}`);
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const last = daysInMonth(y, m);
  return { date: toIso(y, m, Math.min(p.d, last)), clamped: p.d > last };
}

/** Corresponding date `n` years later (or earlier); 29 February clamps to 28 February. */
export function addYears(date: IsoDate, n: number) {
  return addMonths(date, n * 12);
}

/** Adds a period counted "from" `date`: the day itself is excluded (s. 12(1) Limitation Act; s. 9 General Clauses Act). */
export function addPeriod(date: IsoDate, period: Period): { date: IsoDate; clamped: boolean } {
  if (period.unit === "days") return { date: addDays(date, period.amount), clamped: false };
  if (period.unit === "months") return addMonths(date, period.amount);
  return addYears(date, period.amount);
}

export function describePeriod(p: Period): string {
  const singular = p.unit.slice(0, -1);
  return `${p.amount} ${p.amount === 1 ? singular : p.unit}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: IsoDate): number {
  // 1970-01-01 was a Thursday (4).
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekdayName(date: IsoDate) {
  return WEEKDAYS[weekday(date)];
}

/** "15 Jan 2026". Formatted by hand so server and browser always agree. */
export function formatDay(date: IsoDate): string {
  const p = parseIsoDate(date);
  if (!p) return date;
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

/** "Thu, 15 Jan 2026". */
export function formatDayLong(date: IsoDate): string {
  return `${weekdayName(date).slice(0, 3)}, ${formatDay(date)}`;
}

/** Today's calendar date in India (IST), as YYYY-MM-DD. */
export function todayInIndia(now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return toIso(get("year"), get("month"), get("day"));
}

/**
 * Years, months and days from `a` to `b` (b >= a), using corresponding dates:
 * whole years first, then whole months, then the remaining days.
 */
export function calendarSpan(a: IsoDate, b: IsoDate): { years: number; months: number; days: number } {
  if (b < a) throw new RangeError("End date is before start date");
  const pa = parseIsoDate(a)!;
  const pb = parseIsoDate(b)!;
  let months = (pb.y - pa.y) * 12 + (pb.m - pa.m);
  if (addMonths(a, months).date > b) months -= 1;
  // Clamping can land a month short of `b` even though the corresponding day passed; re-check upward.
  while (addMonths(a, months + 1).date <= b) months += 1;
  const anchor = addMonths(a, months).date;
  return { years: Math.floor(months / 12), months: months % 12, days: diffDays(anchor, b) };
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-IN")} ${Math.abs(n) === 1 ? one : many}`;
}

/** A closed range of dates (from ≤ to). A single day has from === to. */
export type DateRange = { from: IsoDate; to: IsoDate };

/** Court closures for s. 4 of the Limitation Act / s. 10 of the General Clauses Act. */
export type CourtClosures = {
  sundays: boolean;
  saturdays: boolean;
  ranges: DateRange[];
};

export const NO_CLOSURES: CourtClosures = { sundays: false, saturdays: false, ranges: [] };

export function closureReason(date: IsoDate, c: CourtClosures): string | null {
  const wd = weekday(date);
  if (c.sundays && wd === 0) return "Sunday";
  if (c.saturdays && wd === 6) return "Saturday";
  const hit = c.ranges.find((r) => date >= r.from && date <= r.to);
  if (hit) return hit.from === hit.to ? `closure on ${formatDay(hit.from)}` : `closure from ${formatDay(hit.from)} to ${formatDay(hit.to)}`;
  return null;
}

/**
 * If `date` falls on a closed day, the next day the court is open, with the
 * closed days skipped. Gives up (returns null) after `limit` consecutive closed days.
 */
export function nextOpenDay(date: IsoDate, c: CourtClosures, limit = 800): { date: IsoDate; skipped: { date: IsoDate; reason: string }[] } | null {
  const skipped: { date: IsoDate; reason: string }[] = [];
  let d = date;
  for (let i = 0; i <= limit; i++) {
    const reason = closureReason(d, c);
    if (!reason) return { date: d, skipped };
    skipped.push({ date: d, reason });
    d = addDays(d, 1);
  }
  return null;
}

/** Cleans user-entered closure ranges: drops invalid rows, orders each range. */
export function normaliseRanges(rows: { from: string; to?: string | null }[]): DateRange[] {
  const out: DateRange[] = [];
  for (const r of rows) {
    if (!isSupportedDate(r.from)) continue;
    const to = r.to && isSupportedDate(r.to) ? r.to : r.from;
    out.push(r.from <= to ? { from: r.from, to } : { from: to, to: r.from });
  }
  return out;
}
