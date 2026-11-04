// UPI "pay" intent links (NPCI deep-link format). Pure, safe for client and server.

/** A UPI ID (VPA): handle@psp, e.g. "advocate.sharma@okhdfcbank". */
export const VPA_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function normalizeVpa(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toLowerCase();
}

export function isValidVpa(raw: string): boolean {
  return VPA_RE.test(raw);
}

// UPI apps expect "@" in pa unescaped; everything else is percent-encoded.
function enc(s: string): string {
  return encodeURIComponent(s).replace(/%40/g, "@");
}

/**
 * upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>
 * The amount is in rupees with two decimals, as UPI apps require.
 */
export function buildUpiLink({
  vpa,
  name,
  amountPaise,
  note,
}: {
  vpa: string;
  name: string;
  amountPaise: number;
  note?: string;
}): string {
  if (!isValidVpa(vpa)) throw new Error("Invalid UPI ID");
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error("UPI amount must be positive");
  const am = `${Math.floor(amountPaise / 100)}.${String(amountPaise % 100).padStart(2, "0")}`;
  const parts = [`pa=${enc(vpa)}`, `pn=${enc(name.trim().slice(0, 50) || vpa)}`, `am=${am}`, "cu=INR"];
  if (note?.trim()) parts.push(`tn=${enc(note.trim().slice(0, 80))}`);
  return `upi://pay?${parts.join("&")}`;
}
