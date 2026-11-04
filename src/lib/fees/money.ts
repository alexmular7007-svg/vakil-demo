// Money helpers for the fee book. Pure functions, safe for client and server.
// All amounts are integer paise.

import { integerToIndianWords } from "@/lib/drafting/fill";

export const GST_MODES = ["none", "reverse_charge", "forward"] as const;
export type GstMode = (typeof GST_MODES)[number];

/** Standard GST rate on legal services, in basis points (18%). */
export const DEFAULT_GST_RATE_BP = 1800;

/** Upper bound for a single amount: ₹100 crore. Keeps sums far below 2^53. */
export const MAX_AMOUNT_PAISE = 100 * 1_00_00_000 * 100;

/**
 * Parses a rupee amount typed by a person ("1,20,000", "₹ 4500.5", "99.99")
 * into integer paise. Returns null for anything that is not a plain amount
 * with at most two decimal places.
 */
export function parseRupeesToPaise(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, "").replace(/^Rs\.?/i, "");
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const paise = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** 12000050 → "120000.50"; 12000000 → "120000". For editable inputs, no grouping. */
export function paiseToInputValue(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  return p ? `${rupees}.${String(p).padStart(2, "0")}` : String(rupees);
}

/**
 * Amount in words in the Indian numbering system, as written on fee memos:
 * 12000000 paise → "Rupees One Lakh Twenty Thousand only".
 */
export function rupeesInWords(paise: number): string {
  if (!Number.isFinite(paise) || paise < 0) return "";
  const total = Math.round(paise);
  const rupees = Math.floor(total / 100);
  const p = total % 100;
  if (rupees === 0 && p > 0) return `${integerToIndianWords(p)} Paise only`;
  const r = `Rupees ${integerToIndianWords(rupees)}`;
  return p ? `${r} and ${integerToIndianWords(p)} Paise only` : `${r} only`;
}

export type InvoiceTotals = {
  subtotalPaise: number;
  /** GST added to the bill. Zero unless the advocate charges GST (forward charge). */
  taxPaise: number;
  totalPaise: number;
  /** Rate stored on the invoice, in basis points (0 unless forward charge). */
  gstRateBp: number;
};

/**
 * Totals per GST mode.
 * - none: no GST (individual / non-business clients are generally exempt).
 * - reverse_charge: the business recipient pays GST to the government itself,
 *   so nothing is added to the bill.
 * - forward: the advocate (for example a registered firm) charges GST; tax is
 *   rounded to the nearest paisa and added.
 */
export function computeInvoiceTotals(amountsPaise: number[], mode: GstMode, rateBp: number = DEFAULT_GST_RATE_BP): InvoiceTotals {
  const subtotalPaise = amountsPaise.reduce((a, b) => a + Math.round(b), 0);
  if (mode !== "forward") return { subtotalPaise, taxPaise: 0, totalPaise: subtotalPaise, gstRateBp: 0 };
  const bp = Math.max(0, Math.round(rateBp));
  const taxPaise = Math.round((subtotalPaise * bp) / 10_000);
  return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise, gstRateBp: bp };
}

/** 1800 → "18%", 1250 → "12.5%" */
export function formatRateBp(bp: number): string {
  return `${Number((bp / 100).toFixed(2))}%`;
}

export const GST_MODE_LABELS: Record<GstMode, string> = {
  none: "No GST",
  reverse_charge: "Reverse charge",
  forward: "Charge GST",
};

/** The statement printed on reverse-charge memos. */
export const REVERSE_CHARGE_NOTE = "GST payable by the recipient under reverse charge";
