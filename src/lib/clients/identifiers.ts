// Validation for Indian identifiers used in the practice modules. Pure, safe for
// client and server.

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * GSTIN: 2-digit state code, 10-character PAN, entity number, "Z", check character.
 * e.g. 27AAPFU0939F1ZV
 */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** The GSTIN check character (mod-36 checksum over the first 14 characters). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i]);
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

/** Format and checksum check. Expects a normalized (upper-case, no spaces) value. */
export function isValidGstin(gstin: string): boolean {
  if (!GSTIN_RE.test(gstin)) return false;
  return gstinCheckChar(gstin.slice(0, 14)) === gstin[14];
}

/**
 * eCourts CNR (Case Number Record): 16 letters and digits, e.g. DLHC010012342024.
 * People often paste it with spaces or hyphens; those are removed.
 */
export const CNR_RE = /^[A-Z0-9]{16}$/;

export function normalizeCnr(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidCnr(cnr: string): boolean {
  return CNR_RE.test(cnr);
}

/** Indian phone numbers as typed: keeps digits and a leading +. */
export function normalizePhone(raw: string): string {
  const t = raw.trim();
  const plus = t.startsWith("+") ? "+" : "";
  return plus + t.replace(/\D/g, "");
}

export function isValidPhone(phone: string): boolean {
  return /^\+?\d{8,15}$/.test(phone);
}

/** Escapes LIKE / ILIKE wildcards so user text matches literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
