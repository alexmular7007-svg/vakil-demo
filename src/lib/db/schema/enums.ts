// Allowed values for text "enum" columns. The single source of truth: the
// database enforces them with CHECK constraints (see the table definitions), and
// application code imports the same lists for validation and labels. Adding a
// value means adding it here and generating a migration (npm run db:generate).
// Pure data: safe to import from client components.

export const MATTER_STATUSES = ["open", "closed"] as const;
export const DOCUMENT_STATUSES = ["processing", "ready", "failed"] as const;
export const DRAFT_STATUSES = ["draft", "final"] as const;
export const CHAT_MODES = ["research", "draft", "explain", "general"] as const;
export const CONSULTATION_STATUSES = ["requested", "accepted", "declined", "closed"] as const;
export const VERIFICATION_STATUSES = ["pending", "verified", "rejected"] as const;
export const PROMPT_VISIBILITIES = ["private", "public"] as const;

export const CLIENT_KINDS = ["individual", "business"] as const;
export const HEARING_STATUSES = ["scheduled", "done", "adjourned", "cancelled"] as const;
export const INVOICE_STATUSES = ["draft", "issued", "partly_paid", "paid", "cancelled"] as const;
export const GST_MODES = ["none", "forward", "reverse_charge"] as const;
export const RECEIPT_MODES = ["cash", "upi", "bank", "cheque", "other"] as const;

export const ENVELOPE_STATUSES = ["DRAFT", "OUT_FOR_SIGNATURE", "PARTIALLY_SIGNED", "COMPLETED", "DECLINED", "EXPIRED", "VOIDED"] as const;
export const RECIPIENT_ROLES = ["SENDER", "RECEIVER", "LAWYER", "OTHER"] as const;
export const RECIPIENT_ACTIONS = ["REVIEW", "SIGN", "WITNESS", "CC"] as const;
export const RECIPIENT_STATUSES = ["PENDING", "SENT", "VIEWED", "APPROVED", "SIGNED", "DECLINED"] as const;
export const SIGNATURE_TYPES = ["electronic", "aadhaar"] as const;

export const SUBSCRIPTION_STATUSES = ["active", "past_due", "cancelled"] as const;
export const BILLING_INTERVALS = ["month", "year"] as const;
export const PAYMENT_STATUSES = ["created", "paid", "failed"] as const;

export const UPDATE_KINDS = ["act", "amendment", "bill", "ordinance", "notification", "judgment", "news"] as const;
export const UPDATE_IMPORTANCE = ["high", "normal", "hidden"] as const;
export const SYNC_KINDS = ["india_code", "feeds", "judgments"] as const;
export const SYNC_STATUSES = ["running", "ok", "partial", "failed"] as const;
export const REVISION_SOURCES = ["india_code", "admin"] as const;
