// Indian financial year (1 April to 31 March) and invoice numbering.
// Pure functions, safe for client and server. Dates are ISO "YYYY-MM-DD" strings
// in India Standard Time, matching Postgres `date` columns.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's date in India (Asia/Kolkata), as YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Calendar arithmetic on ISO dates (no time zone involved). */
export function addDays(iso: string, days: number): string {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type FinancialYear = {
  /** "2026-27" */
  label: string;
  /** "2026-04-01" */
  start: string;
  /** "2027-03-31" */
  end: string;
  startYear: number;
};

/** The financial year an ISO date falls in: 2026-11-03 → 2026-27; 2027-03-31 → 2026-27; 2027-04-01 → 2027-28. */
export function financialYearOf(iso: string): FinancialYear {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  const y = Number(m[1]);
  const month = Number(m[2]);
  const startYear = month >= 4 ? y : y - 1;
  return {
    label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    startYear,
  };
}

export const INVOICE_PREFIX_RE = /^[A-Z0-9][A-Z0-9-]{0,11}$/;

/** Upper-cases and strips characters not allowed in an invoice prefix. */
export function normalizeInvoicePrefix(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 12);
}

/** ("INV", "2026-27", 1) → "INV/2026-27/0001" */
export function formatInvoiceNumber(prefix: string, fyLabel: string, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error("Invoice sequence starts at 1");
  return `${prefix}/${fyLabel}/${String(seq).padStart(4, "0")}`;
}

/** The trailing sequence of an invoice number, or null: "INV/2026-27/0042" → 42. */
export function parseInvoiceSeq(number: string): number | null {
  const m = /\/(\d+)$/.exec(number);
  return m ? Number(m[1]) : null;
}

/**
 * Next sequence for a financial year, given the numbers already used by the owner.
 * The series runs per financial year across prefixes, so changing the prefix
 * mid-year does not restart it.
 */
export function nextInvoiceSeq(existingNumbers: string[], fyLabel: string): number {
  let max = 0;
  for (const n of existingNumbers) {
    if (!n.includes(`/${fyLabel}/`)) continue;
    const seq = parseInvoiceSeq(n);
    if (seq !== null && seq > max) max = seq;
  }
  return max + 1;
}
