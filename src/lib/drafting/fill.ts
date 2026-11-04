// Placeholder filling for drafting templates. Pure functions, safe for client and server.
//
// Syntax in template bodies:
//   {{name}}          value of field `name`, formatted by field type
//   {{name|inr}}      number with Indian digit grouping: 1,50,000
//   {{name|words}}    amount in words, Indian system: One Lakh Fifty Thousand
//   {{name|long}}     long date: 12 March 2026 (12 मार्च 2026 in Hindi drafts)
//   {{name|upper}}    UPPER CASE
//   {{name|ordinal}}  5 → 5th
//   {{name|numbered}} one numbered paragraph per line of a textarea
// Empty optional fields use the field's fallback; otherwise the {{token}} is kept
// so the advocate can see what still needs filling.

import type { DraftLanguage, TemplateField } from "./types";

export const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([a-z]+)\s*)?\}\}/g;

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];

function parseIsoDate(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** 2026-03-12 → 12.03.2026 (the usual format in Indian pleadings). */
export function formatDateShort(v: string): string {
  const p = parseIsoDate(v);
  if (!p) return v;
  return `${String(p.d).padStart(2, "0")}.${String(p.m).padStart(2, "0")}.${p.y}`;
}

/** 2026-03-12 → 12 March 2026 / 12 मार्च 2026 */
export function formatDateLong(v: string, lang: DraftLanguage = "en"): string {
  const p = parseIsoDate(v);
  if (!p) return v;
  const months = lang === "hi" ? MONTHS_HI : MONTHS_EN;
  return `${p.d} ${months[p.m - 1]} ${p.y}`;
}

export function parseAmount(v: string): number | null {
  const cleaned = v.replace(/[,\s₹]/g, "").replace(/^rs\.?/i, "").replace(/\/-$/, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 150000 → 1,50,000 ; 1234.5 → 1,234.50 */
export function formatIndianNumber(n: number): string {
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** Whole number in words using the Indian system (thousand, lakh, crore). */
export function integerToIndianWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  n = Math.floor(n);
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const rest = n % 1e7;
  if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
  const lakh = Math.floor(rest / 1e5);
  const thousand = Math.floor((rest % 1e5) / 1e3);
  const below = rest % 1e3;
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (below) parts.push(belowThousand(below));
  return parts.join(" ");
}

/** 150000.5 → "One Lakh Fifty Thousand and Fifty Paise" */
export function amountInWords(n: number): string {
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  const r = integerToIndianWords(rupees);
  return paise ? `${r} and ${belowHundred(paise)} Paise` : r;
}

/** 1 → 1st, 2 → 2nd, 11 → 11th, 23 → 23rd */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** One numbered paragraph per non-empty line; lines already numbered are kept as they are. */
export function numberParagraphs(value: string): string {
  const lines = value
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.every((l) => /^\(?\d+[.)]/.test(l))) return lines.join("\n\n");
  return lines.map((l, i) => `${i + 1}. ${l.replace(/^\(?\d+[.)]\s*/, "")}`).join("\n\n");
}

function formatValue(field: TemplateField | undefined, raw: string, filter: string | undefined, lang: DraftLanguage): string {
  const value = raw.trim();
  if (filter === "inr") {
    const n = parseAmount(value);
    return n === null ? value : formatIndianNumber(n);
  }
  if (filter === "words") {
    const n = parseAmount(value);
    return n === null ? value : amountInWords(n);
  }
  if (filter === "long") return formatDateLong(value, lang);
  if (filter === "ordinal") {
    const n = parseAmount(value);
    return n === null || !Number.isInteger(n) ? value : ordinal(n);
  }
  if (filter === "numbered") return numberParagraphs(value);
  if (filter === "upper") return value.toLocaleUpperCase("en-IN");
  if (filter === "lower") return value.toLocaleLowerCase("en-IN");
  if (!field) return value;
  if (field.type === "date") return formatDateShort(value);
  if (field.type === "select") {
    const opt = field.options?.find((o) => o.value === value);
    if (opt) return lang === "hi" ? opt.hi ?? opt.label : opt.label;
  }
  return value;
}

/**
 * Replace placeholders in `body` with formatted values. Unknown placeholders and
 * empty fields without a fallback are left as {{tokens}} for the user to fill.
 */
export function fillTemplate(
  body: string,
  fields: TemplateField[],
  values: Record<string, string | undefined>,
  lang: DraftLanguage = "en",
): string {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const resolve = (token: string, name: string, filter: string | undefined): string => {
    const field = byName.get(name);
    const raw = values[name];
    if (raw !== undefined && raw.trim() !== "") return formatValue(field, raw, filter, lang);
    if (field) {
      const fb = lang === "hi" ? field.fallbackHi ?? field.fallback : field.fallback;
      if (fb !== undefined) return fb;
    }
    return token;
  };
  // Line by line, so a multi-line value placed on a prefixed line (">> ", "^^ ",
  // "# ") keeps that prefix on every inserted line.
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const prefix = /^\s*(#{1,3} |>>\s?|\^\^\s?)/.exec(line)?.[0] ?? "";
      return line.replace(PLACEHOLDER_RE, (token, name: string, filter: string | undefined) => {
        const v = resolve(token, name, filter).replace(/\r\n?/g, "\n");
        return prefix ? v.split("\n").join(`\n${prefix}`) : v;
      });
    })
    .join("\n");
}

/** Distinct placeholder names still present in a body, in order of appearance. */
export function findPlaceholders(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(PLACEHOLDER_RE)) seen.add(m[1]);
  return [...seen];
}

/** Turns `name_of_party` into "name of party" for display. */
export function humanizePlaceholder(name: string): string {
  return name.replace(/_/g, " ").trim();
}

export type InputErrors = Record<string, string>;

/**
 * Field-level validation shared by the wizard (inline errors) and the server
 * action (authoritative). Returns trimmed values limited to known fields.
 */
export function validateInputs(
  fields: TemplateField[],
  values: Record<string, unknown>,
): { ok: boolean; errors: InputErrors; clean: Record<string, string> } {
  const errors: InputErrors = {};
  const clean: Record<string, string> = {};
  for (const f of fields) {
    const raw = values[f.name];
    const v = typeof raw === "string" ? raw.trim() : "";
    const maxLen = f.type === "textarea" ? 20000 : 1000;
    if (!v) {
      if (f.required) errors[f.name] = `${f.label} is required.`;
      continue;
    }
    if (v.length > maxLen) {
      errors[f.name] = `Keep this under ${maxLen.toLocaleString("en-IN")} characters.`;
      continue;
    }
    if (f.type === "date" && !parseIsoDate(v)) {
      errors[f.name] = "Enter a valid date.";
      continue;
    }
    if (f.type === "number") {
      const n = parseAmount(v);
      if (n === null) {
        errors[f.name] = "Enter a number.";
        continue;
      }
      if (f.min !== undefined && n < f.min) {
        errors[f.name] = `Must be at least ${f.min}.`;
        continue;
      }
      if (f.max !== undefined && n > f.max) {
        errors[f.name] = `Must be at most ${f.max}.`;
        continue;
      }
    }
    if (f.type === "select" && !f.options?.some((o) => o.value === v)) {
      errors[f.name] = "Choose one of the options.";
      continue;
    }
    clean[f.name] = v;
  }
  return { ok: Object.keys(errors).length === 0, errors, clean };
}
