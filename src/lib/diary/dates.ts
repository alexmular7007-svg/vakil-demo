// Calendar-date helpers for the case diary. Hearing dates are plain calendar
// dates ("YYYY-MM-DD") in India, so all arithmetic is done on UTC midnights and
// "today" is always computed in Asia/Kolkata. Safe for client and server.

export const IST = "Asia/Kolkata";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = YMD.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1950 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** True for a 24-hour clock time written as HH:MM. */
export function isHhmm(s: unknown): s is string {
  return typeof s === "string" && HHMM.test(s);
}

/** Today's calendar date in India. */
export function todayIST(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  return fromUtc(new Date(toUtc(ymd).getTime() + n * DAY_MS));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);
}

/** Monday of the week containing `ymd` (Indian courts sit Monday to Saturday). */
export function startOfWeek(ymd: string): string {
  const wd = toUtc(ymd).getUTCDay(); // 0 = Sunday
  return addDays(ymd, -((wd + 6) % 7));
}

/** The seven dates (Monday to Sunday) of the week containing `ymd`. */
export function weekDays(ymd: string): string[] {
  const start = startOfWeek(ymd);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return toUtc(ymd).getUTCDay();
}

/** Formats a calendar date without any timezone shift (same output on server and phone). */
export function formatYmd(
  ymd: string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  if (!isYmd(ymd)) return "—";
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" }).format(toUtc(ymd));
}

/** "Tue, 17 Nov 2026" (en-IN would otherwise put a comma before the year). */
export function formatDayDate(ymd: string): string {
  if (!isYmd(ymd)) return "—";
  return `${formatYmd(ymd, { weekday: "short" })}, ${formatYmd(ymd)}`;
}

/** "Today", "Tomorrow", "Yesterday" or null. */
export function relativeDay(ymd: string, today: string): string | null {
  const diff = daysBetween(today, ymd);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return null;
}

/** "November 2026", or "Oct – Nov 2026" / "Dec 2026 – Jan 2027" when the range spans months. */
export function rangeLabel(first: string, last: string): string {
  const a = toUtc(first);
  const b = toUtc(last);
  const month = (d: Date, style: "long" | "short") => new Intl.DateTimeFormat("en-IN", { month: style, timeZone: "UTC" }).format(d);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${month(a, "short")} ${a.getUTCFullYear()} – ${month(b, "short")} ${b.getUTCFullYear()}`;
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${month(a, "short")} – ${month(b, "short")} ${b.getUTCFullYear()}`;
  return `${month(a, "long")} ${a.getUTCFullYear()}`;
}

/** "10:30" → "10:30 am"; anything else → null. */
export function formatTime(hhmm: string | null | undefined): string | null {
  if (!isHhmm(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** UTC ISO instant for an IST calendar date and optional time (start of day when no time). */
export function istInstant(ymd: string, hhmm?: string | null): string {
  const t = isHhmm(hhmm) ? hhmm : "00:00";
  return new Date(`${ymd}T${t}:00+05:30`).toISOString();
}

/** First number inside an item/serial number ("14", "S-14A" → 14), for sorting. */
export function itemNumber(item: string | null | undefined): number | null {
  const m = item ? /\d+/.exec(item) : null;
  return m ? Number(m[0]) : null;
}

type Sortable = { hearingDate: string; hearingTime: string | null; itemNo: string | null; caseTitle: string };

/** Board order: date, then time (untimed last), then item number, then title. */
export function compareHearings(a: Sortable, b: Sortable): number {
  if (a.hearingDate !== b.hearingDate) return a.hearingDate < b.hearingDate ? -1 : 1;
  const ta = isHhmm(a.hearingTime) ? a.hearingTime : null;
  const tb = isHhmm(b.hearingTime) ? b.hearingTime : null;
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta < tb ? -1 : 1;
  }
  const ia = itemNumber(a.itemNo);
  const ib = itemNumber(b.itemNo);
  if (ia !== ib) {
    if (ia === null) return 1;
    if (ib === null) return -1;
    return ia - ib;
  }
  return a.caseTitle.localeCompare(b.caseTitle, "en-IN");
}

/** Groups already-sorted items by `hearingDate`, keeping order. */
export function groupByDate<T extends { hearingDate: string }>(items: T[]): { date: string; items: T[] }[] {
  const out: { date: string; items: T[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.date === it.hearingDate) last.items.push(it);
    else out.push({ date: it.hearingDate, items: [it] });
  }
  return out;
}

/** Parses Indian day-first dates ("15.12.2026", "15/12/26", "15-12-2026") or ISO. */
export function parseIndianDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (isYmd(t)) return t;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const ymd = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isYmd(ymd) ? ymd : null;
}
