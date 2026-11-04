// Interest between two dates on a principal: simple, or compound with monthly,
// quarterly or annual rests.
//
// Conventions (shown to the user in the working):
//   - Days are counted from the start date to the end date, excluding the first
//     day and including the last (s. 9, General Clauses Act style "from ... to").
//   - Simple interest: principal × rate × days ÷ 365 (Actual/365).
//   - Compound interest: each whole compounding period earns rate × months ÷ 12
//     on the balance at its start; a final broken period earns simple interest
//     at rate × days ÷ 365. Period boundaries are corresponding dates counted
//     from the start date, so 31 Jan + 1 month is 28/29 Feb.
// No rate is suggested: the rate is whatever the contract, decree or statute says.

import { addMonths, addYears, diffDays, formatDay, isSupportedDate, plural, type IsoDate } from "./dates";
import type { CalcNote, WorkingStep } from "./limitation";

export type InterestMethod = "simple" | "compound";
export type Compounding = "monthly" | "quarterly" | "annually";

export const COMPOUNDING_MONTHS: Record<Compounding, number> = { monthly: 1, quarterly: 3, annually: 12 };
export const COMPOUNDING_LABEL: Record<Compounding, string> = { monthly: "Monthly", quarterly: "Quarterly", annually: "Annually" };
/** Adjective for "… rests": monthly, quarterly, annual. */
export const COMPOUNDING_REST: Record<Compounding, string> = { monthly: "monthly", quarterly: "quarterly", annually: "annual" };
export const DAYS_IN_YEAR = 365;
export const MAX_PRINCIPAL = 1e13;
export const MAX_YEARS = 100;

export type InterestInput = {
  principal: number | string;
  ratePercent: number | string;
  from: string;
  to: string;
  method: InterestMethod;
  compounding?: Compounding;
};

export type InterestRow = {
  index: number;
  from: IsoDate;
  to: IsoDate;
  days: number;
  opening: number;
  interest: number;
  closing: number;
  /** A broken (part) period, charged by days. */
  part: boolean;
};

export type InterestResult =
  | { ok: false; errors: string[] }
  | {
      ok: true;
      method: InterestMethod;
      compounding: Compounding | null;
      principal: number;
      ratePercent: number;
      from: IsoDate;
      to: IsoDate;
      days: number;
      interest: number;
      amount: number;
      /** Interest for one day on the principal (simple interest only). */
      perDay: number | null;
      /** Effective annual rate for compound interest, in percent. */
      effectiveRate: number | null;
      rows: InterestRow[];
      steps: WorkingStep[];
      notes: CalcNote[];
    };

function toNumber(v: number | string): number {
  if (typeof v === "number") return v;
  const cleaned = v.replace(/[,\s₹]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

/** Rounds to the paisa. */
export function roundPaise(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatRupees(n: number) {
  return `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(roundPaise(n))}`;
}

export function computeInterest(input: InterestInput): InterestResult {
  const errors: string[] = [];
  const principal = toNumber(input.principal);
  const rate = toNumber(input.ratePercent);
  if (!Number.isFinite(principal) || principal <= 0) errors.push("Enter a principal amount above zero.");
  else if (principal > MAX_PRINCIPAL) errors.push("The principal is too large for this calculator.");
  if (!Number.isFinite(rate) || rate <= 0) errors.push("Enter an annual rate above zero.");
  else if (rate > 100) errors.push("Enter an annual rate of 100% or less.");
  if (!isSupportedDate(input.from)) errors.push("Enter a valid start date.");
  if (!isSupportedDate(input.to)) errors.push("Enter a valid end date.");
  if (isSupportedDate(input.from) && isSupportedDate(input.to)) {
    if (input.to <= input.from) errors.push("The end date must be after the start date.");
    else if (input.to > addYears(input.from, MAX_YEARS).date) errors.push(`Keep the period within ${MAX_YEARS} years.`);
  }
  const compounding = input.method === "compound" ? (input.compounding ?? "annually") : null;
  if (compounding && !(compounding in COMPOUNDING_MONTHS)) errors.push("Choose how often interest is compounded.");
  if (errors.length) return { ok: false, errors };

  const from = input.from;
  const to = input.to;
  const days = diffDays(from, to);
  const r = rate / 100;
  const steps: WorkingStep[] = [];
  const notes: CalcNote[] = [];
  const rows: InterestRow[] = [];

  steps.push({
    title: `${plural(days, "day")} from ${formatDay(from)} to ${formatDay(to)}`,
    detail: "The start date is excluded and the end date included.",
  });

  if (input.method === "simple") {
    // Breakdown by year from the start date; every row uses the same per-day rate.
    let k = 0;
    let cursor = from;
    let accrued = 0;
    while (cursor < to) {
      const next = addYears(from, k + 1).date;
      const end = next < to ? next : to;
      const d = diffDays(cursor, end);
      const interest = (principal * r * d) / DAYS_IN_YEAR;
      accrued += interest;
      rows.push({ index: k + 1, from: cursor, to: end, days: d, opening: principal, interest, closing: principal + accrued, part: end !== next });
      cursor = end;
      k += 1;
    }
    const interest = (principal * r * days) / DAYS_IN_YEAR;
    const perDay = (principal * r) / DAYS_IN_YEAR;
    steps.push({
      title: `Interest = ${formatRupees(principal)} × ${rate}% × ${days} ÷ ${DAYS_IN_YEAR}`,
      detail: `Simple interest on the principal only. Each day earns 1/${DAYS_IN_YEAR} of the annual rate (${formatRupees(perDay)} a day), leap years included.`,
    });
    steps.push({ title: `Interest: ${formatRupees(interest)}`, detail: `Principal plus interest: ${formatRupees(principal + interest)}.` });
    notes.push(...commonNotes());
    return {
      ok: true,
      method: "simple",
      compounding: null,
      principal,
      ratePercent: rate,
      from,
      to,
      days,
      interest,
      amount: principal + interest,
      perDay,
      effectiveRate: null,
      rows,
      steps,
      notes,
    };
  }

  // Compound interest.
  const m = COMPOUNDING_MONTHS[compounding!];
  const periodRate = (r * m) / 12;
  let balance = principal;
  let cursor = from;
  let k = 0;
  for (;;) {
    const next = addMonths(from, (k + 1) * m).date;
    if (next > to) break;
    const interest = balance * periodRate;
    rows.push({ index: k + 1, from: cursor, to: next, days: diffDays(cursor, next), opening: balance, interest, closing: balance + interest, part: false });
    balance += interest;
    cursor = next;
    k += 1;
  }
  const wholePeriods = k;
  if (cursor < to) {
    const d = diffDays(cursor, to);
    const interest = (balance * r * d) / DAYS_IN_YEAR;
    rows.push({ index: k + 1, from: cursor, to, days: d, opening: balance, interest, closing: balance + interest, part: true });
    balance += interest;
  }
  const interest = balance - principal;
  const n = 12 / m;
  const effectiveRate = (Math.pow(1 + r / n, n) - 1) * 100;
  const periodName = { monthly: "month", quarterly: "quarter", annually: "year" }[compounding!];
  steps.push({
    title: `${plural(wholePeriods, `whole ${periodName}`)} compounded ${COMPOUNDING_LABEL[compounding!].toLowerCase()}`,
    detail: `Each whole ${periodName} earns ${rate}% × ${m}/12 = ${roundTo(periodRate * 100, 4)}% on the balance at its start, and that interest is added to the balance. Periods run to the corresponding date of each ${m === 1 ? "month" : m === 3 ? "third month" : "year"} from ${formatDay(from)}.`,
  });
  const last = rows[rows.length - 1];
  if (last?.part) {
    steps.push({
      title: `Broken period of ${plural(last.days, "day")}`,
      detail: `From ${formatDay(last.from)} to ${formatDay(last.to)}: simple interest on the balance at ${rate}% × ${last.days} ÷ ${DAYS_IN_YEAR} = ${formatRupees(last.interest)}.`,
    });
  }
  steps.push({
    title: `Interest: ${formatRupees(interest)}`,
    detail: `Principal plus interest: ${formatRupees(balance)}. Effective annual rate with ${COMPOUNDING_REST[compounding!]} rests: ${roundTo(effectiveRate, 4)}%.`,
  });
  notes.push(...commonNotes());
  return {
    ok: true,
    method: "compound",
    compounding: compounding!,
    principal,
    ratePercent: rate,
    from,
    to,
    days,
    interest,
    amount: balance,
    perDay: null,
    effectiveRate,
    rows,
    steps,
    notes,
  };
}

function roundTo(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function commonNotes(): CalcNote[] {
  return [
    {
      tone: "info",
      title: "Interest under s. 34 CPC",
      body: "Where a decree is for the payment of money, the court may order interest on the principal sum adjudged from the date of the suit to the date of the decree (pendente lite), and further interest from the decree to the date of payment or an earlier date, at rates it deems reasonable within the limits s. 34 sets. A decree silent on further interest is deemed to have refused it. Use the rate and dates the decree states.",
      cite: "s. 34, Code of Civil Procedure, 1908",
    },
    {
      tone: "info",
      title: "Rounding",
      body: "Figures are calculated in full and rounded to the paisa only for display, so row amounts may differ from the total by a paisa.",
    },
  ];
}
