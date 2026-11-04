// Formatting helpers shared by pages, emails and the certificate. Client-safe.

/** "rahul.sharma@gmail.com" -> "r***a@g***.com". Never reveals the full address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  const maskedLocal = local.length <= 2 ? `${local[0]}***` : `${local[0]}***${local[local.length - 1]}`;
  const maskedHost = host.length ? `${host[0]}***` : "***";
  return `${maskedLocal}@${maskedHost}${tld}`;
}

const istFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** "02 Nov 2026, 21:14:05 IST" */
export function formatIst(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return `${istFormatter.format(typeof d === "string" ? new Date(d) : d)} IST`;
}

export function shortHash(hash: string | null | undefined, n = 12): string {
  if (!hash) return "—";
  return `${hash.slice(0, n)}…${hash.slice(-6)}`;
}

/** Human label for an esign.events type. Unknown types fall back to the raw name. */
export const eventLabels: Record<string, string> = {
  "envelope.sent": "Envelope sent and document hash locked",
  "recipient.notified": "Signing link emailed",
  "otp.sent": "One-time code emailed",
  "otp.verified": "Email verified with one-time code",
  "otp.failed": "Incorrect one-time code entered",
  "document.opened": "Document opened",
  "consent.accepted": "Consent to sign electronically recorded",
  "recipient.approved": "Approved the document",
  "recipient.signed": "Signed the document",
  "recipient.declined": "Declined",
  "order.completed": "Routing step completed",
  "envelope.completed": "Completed; final PDF and certificate stored",
  "envelope.voided": "Voided by the sender",
  "envelope.expired": "Expired before everyone finished",
  "document.integrity_failed": "Document integrity check failed",
  "email.failed": "Email could not be delivered",
};

export function eventLabel(type: string): string {
  return eventLabels[type] ?? type;
}
