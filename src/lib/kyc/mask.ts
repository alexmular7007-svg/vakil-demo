// Masking for identity numbers shown in the UI or written to the audit log.

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const AADHAAR_RE = /^[2-9][0-9]{11}$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** ABCDE1234F -> XXXXXX234F */
export function maskPan(pan: string) {
  const p = pan.replace(/\s+/g, "").toUpperCase();
  return p.length <= 4 ? "XXXX" : `${"X".repeat(p.length - 4)}${p.slice(-4)}`;
}

/** 234123412346 -> XXXX XXXX 2346 */
export function maskAadhaar(aadhaar: string) {
  const d = aadhaar.replace(/\D/g, "");
  return `XXXX XXXX ${d.slice(-4).padStart(4, "X")}`;
}

/** 001234567890 -> XXXXXXXX7890 */
export function maskAccount(account: string) {
  const d = account.replace(/\s+/g, "");
  return d.length <= 4 ? "XXXX" : `${"X".repeat(Math.min(8, d.length - 4))}${d.slice(-4)}`;
}

/**
 * Deep-copies a provider response with identity numbers masked: any value under a key
 * that names Aadhaar/PAN/account, plus any free-standing 12-digit or PAN-shaped string.
 * Photos and other base64 blobs are dropped.
 */
export function maskDeep(value: unknown, keyHint = ""): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, keyHint));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/photo|image|xml|signature|zip|file/i.test(k)) {
        out[k] = v ? "[omitted]" : v;
        continue;
      }
      out[k] = maskDeep(v, k);
    }
    return out;
  }
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    const compact = s.replace(/[\s-]/g, "");
    if (/aadhaar|aadhar|^uid$/i.test(keyHint) && /\d{4,}/.test(compact)) return maskAadhaar(compact);
    if (/^pan|\bpan\b|pan_?(no|num|number)$/i.test(keyHint) && /^[A-Z0-9]{6,}$/i.test(compact)) return maskPan(compact);
    if (/account|acc_no|accno/i.test(keyHint) && /^\d{6,}$/.test(compact)) return maskAccount(compact);
    if (/^\d{12}$/.test(compact)) return maskAadhaar(compact);
    if (PAN_RE.test(compact.toUpperCase())) return maskPan(compact);
    if (typeof value === "string" && s.length > 400) return `${s.slice(0, 80)}… [truncated]`;
    return value;
  }
  return value;
}
