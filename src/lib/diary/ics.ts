// RFC 5545 iCalendar builder for the case diary export. Pure; no I/O.
import { addDays, isHhmm } from "./dates";
import { timedRange } from "./links";

export type IcsEvent = {
  uid: string;
  /** YYYY-MM-DD */
  date: string;
  /** "HH:MM" in IST; omitted or null makes an all-day event. */
  time?: string | null;
  durationMinutes?: number;
  summary: string;
  location?: string | null;
  description?: string | null;
};

const CRLF = "\r\n";
const encoder = new TextEncoder();

/** Escapes a TEXT value (RFC 5545 §3.3.11): backslash, semicolon, comma and newlines. */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets (§3.1) without splitting a UTF-8 sequence. */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    if (bytes + b > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // continuation lines start with one space
    }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join(`${CRLF} `);
}

/** "20261103T101500Z" */
export function icsUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const compact = (ymd: string) => ymd.replaceAll("-", "");

// Asia/Kolkata has had no daylight saving since 1945: one STANDARD rule suffices.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Asia/Kolkata",
  "X-LIC-LOCATION:Asia/Kolkata",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0530",
  "TZOFFSETTO:+0530",
  "TZNAME:IST",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function eventLines(e: IcsEvent, stamp: string): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`];
  if (isHhmm(e.time)) {
    const { start, end } = timedRange(e.date, e.time, e.durationMinutes ?? 60);
    lines.push(`DTSTART;TZID=Asia/Kolkata:${start}`, `DTEND;TZID=Asia/Kolkata:${end}`, "TRANSP:OPAQUE");
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.date, 1))}`, "TRANSP:TRANSPARENT");
  }
  lines.push(`SUMMARY:${escapeIcsText(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${escapeIcsText(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
  lines.push("STATUS:CONFIRMED", "END:VEVENT");
  return lines;
}

/** A complete VCALENDAR with CRLF line endings and folded lines. */
export function buildIcs(events: IcsEvent[], opts: { name?: string; now?: Date } = {}): string {
  const stamp = icsUtcStamp(opts.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vaakil AI//Case diary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(opts.name ?? "Vaakil AI case diary")}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
    ...VTIMEZONE,
    ...events.flatMap((e) => eventLines(e, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
