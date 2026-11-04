// E-sign constants shared by server and client code. No secrets, no server imports.
// Every rule about roles, actions, statuses and limits lives here (or in the
// schema enums it re-exports), so the workflow, the forms and the server read
// the same values.

// Allowed values live in the schema (enforced by CHECK constraints in the database).
import { ENVELOPE_STATUSES, RECIPIENT_ACTIONS, RECIPIENT_ROLES, RECIPIENT_STATUSES, SIGNATURE_TYPES } from "@/lib/db/schema/enums";

export { ENVELOPE_STATUSES, RECIPIENT_ACTIONS, RECIPIENT_STATUSES, SIGNATURE_TYPES };
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

/** States an envelope never leaves (the esign.protect_envelope trigger enforces the same list). */
export const TERMINAL_STATUSES: readonly EnvelopeStatus[] = ["COMPLETED", "DECLINED", "EXPIRED", "VOIDED"];
/** States in which recipients can act and the envelope can expire. */
export const IN_FLIGHT_STATUSES: readonly EnvelopeStatus[] = ["OUT_FOR_SIGNATURE", "PARTIALLY_SIGNED"];

export const ROLE_LABELS = RECIPIENT_ROLES;
export type RoleLabel = (typeof ROLE_LABELS)[number];

export type RecipientAction = (typeof RECIPIENT_ACTIONS)[number];

export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export type SignatureType = (typeof SIGNATURE_TYPES)[number];

/** Recipient statuses that mean "this person has finished their part". */
export const DONE_RECIPIENT_STATUSES: readonly RecipientStatus[] = ["APPROVED", "SIGNED"];

export type ActionRule = {
  /** Takes part in the routing. Copy recipients only receive the final PDF. */
  actionable: boolean;
  /** Status the recipient reaches when they finish (null for copies). */
  completesAs: Extract<RecipientStatus, "APPROVED" | "SIGNED"> | null;
  /** What the signer portal asks them to do. */
  verb: "approve" | "sign" | null;
  /** Where the action sits relative to the signers in the routing order. */
  phase: "before_signers" | "signers" | "after_signers" | "copy";
  /** How the recipient proves who they are before acting (stored in recipients.auth_method). */
  authMethod: "email_otp" | "none";
};

/** The behaviour of every recipient action. Adding an action means adding it to enums.ts and here. */
export const ACTION_RULES: Readonly<Record<RecipientAction, ActionRule>> = {
  REVIEW: { actionable: true, completesAs: "APPROVED", verb: "approve", phase: "before_signers", authMethod: "email_otp" },
  SIGN: { actionable: true, completesAs: "SIGNED", verb: "sign", phase: "signers", authMethod: "email_otp" },
  WITNESS: { actionable: true, completesAs: "SIGNED", verb: "sign", phase: "after_signers", authMethod: "email_otp" },
  CC: { actionable: false, completesAs: null, verb: null, phase: "copy", authMethod: "none" },
};

export type RoleRule = {
  /** May be linked to a verified advocate profile (their registered email is used). */
  canLinkAdvocate: boolean;
};

export const ROLE_RULES: Readonly<Record<RoleLabel, RoleRule>> = {
  SENDER: { canLinkAdvocate: false },
  RECEIVER: { canLinkAdvocate: false },
  LAWYER: { canLinkAdvocate: true },
  OTHER: { canLinkAdvocate: false },
};

export function actionRule(action: string): ActionRule | undefined {
  return (ACTION_RULES as Record<string, ActionRule | undefined>)[action];
}

export function roleRule(role: string): RoleRule | undefined {
  return (ROLE_RULES as Record<string, RoleRule | undefined>)[role];
}

export const MAX_RECIPIENTS = 20;
export const MAX_ROUTING_ORDER = 20;
export const MIN_EXPIRY_DAYS = 1;
export const MAX_EXPIRY_DAYS = 90;
export const DEFAULT_EXPIRY_DAYS = 14;

export const OTP_TTL_MINUTES = 10;
/** Wrong codes allowed per code before a new one must be requested. */
export const OTP_MAX_ATTEMPTS = 5;
/** A second "email me a code" within this window keeps the code already sent (double click, quick retry). */
export const OTP_RESEND_SECONDS = 60;
/** Lifetime of the signer's verified-email cookie. */
export const SIGNER_SESSION_MINUTES = 30;
/** Drawn signatures are PNG data URLs; the decoded image may not exceed this. */
export const MAX_SIGNATURE_PNG_BYTES = 200 * 1024;
/** How many overdue envelopes one expireOverdueEnvelopes() run handles. */
export const EXPIRY_SWEEP_BATCH = 200;

type Limit = { readonly limit: number; readonly windowSeconds: number };

/** Rate limits (enforced with src/lib/rate-limit.ts). Per recipient, per IP or per owner as named. */
export const ESIGN_RATE_LIMITS = {
  otpSendPerRecipient: { limit: 3, windowSeconds: 600 },
  otpSendPerRecipientDaily: { limit: 10, windowSeconds: 86_400 },
  otpSendPerIp: { limit: 20, windowSeconds: 3600 },
  otpVerifyPerRecipient: { limit: 10, windowSeconds: 600 },
  otpVerifyPerRecipientDaily: { limit: 30, windowSeconds: 86_400 },
  otpVerifyPerIp: { limit: 60, windowSeconds: 3600 },
  signerActPerRecipient: { limit: 10, windowSeconds: 600 },
  documentPerRecipient: { limit: 30, windowSeconds: 600 },
  ownerCreate: { limit: 20, windowSeconds: 3600 },
  ownerSend: { limit: 30, windowSeconds: 3600 },
  ownerVoid: { limit: 30, windowSeconds: 3600 },
  ownerDelete: { limit: 60, windowSeconds: 3600 },
  remindPerEnvelope: { limit: 5, windowSeconds: 3600 },
  ownerComplete: { limit: 10, windowSeconds: 600 },
  ownerVerifyChain: { limit: 30, windowSeconds: 600 },
  ownerDownload: { limit: 60, windowSeconds: 600 },
  advocateSearch: { limit: 60, windowSeconds: 60 },
  publicIntegrityPerIp: { limit: 30, windowSeconds: 600 },
} as const satisfies Record<string, Limit>;

export const statusLabels: Record<EnvelopeStatus, string> = {
  DRAFT: "Draft",
  OUT_FOR_SIGNATURE: "Out for signature",
  PARTIALLY_SIGNED: "In progress",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  VOIDED: "Voided",
};

export const roleLabels: Record<RoleLabel, string> = {
  SENDER: "Sender",
  RECEIVER: "Receiver",
  LAWYER: "Lawyer",
  OTHER: "Other party",
};

export const actionLabels: Record<RecipientAction, string> = {
  REVIEW: "Review and approve",
  SIGN: "Sign",
  WITNESS: "Witness",
  CC: "Receive a copy",
};

export const recipientStatusLabels: Record<RecipientStatus, string> = {
  PENDING: "Waiting",
  SENT: "Link sent",
  VIEWED: "Verified",
  APPROVED: "Approved",
  SIGNED: "Signed",
  DECLINED: "Declined",
};

/**
 * The legal framing. It must appear wherever the signature is described: the
 * UI, emails and the completion certificate. Do not add statutory badges.
 */
export const TIER2_NAME = "Tier-2 electronic signature";
export const LEGAL_FRAMING =
  "This is a Tier-2 electronic signature: email one-time code (OTP) authentication, recorded consent, a typed or drawn signature and a hash-chained audit trail. It can be valid as an electronic contract under section 10A of the Information Technology Act, 2000 where the law does not require a special form. It is not an Aadhaar eSign and not a Digital Signature Certificate (DSC), and it does not carry the statutory presumption those have.";
export const LEGAL_FRAMING_SHORT =
  "Tier-2 electronic signature (email OTP, consent, typed or drawn signature, hash-chained audit trail). Not Aadhaar eSign and not a Digital Signature Certificate.";

export const AADHAAR_UNAVAILABLE =
  "Aadhaar eSign is issued only by a licensed eSign Service Provider. Vaakil AI can offer it through a licensed aggregator, but none is connected to this workspace yet, so it cannot be selected. Use the Tier-2 electronic signature for documents where the law does not require a particular form.";

/**
 * Versioned consent text. Change the version whenever the wording changes; each
 * signer's consent event records the version and the SHA-256 of the text they saw.
 */
export const CONSENT_VERSION = "esign-consent-2026-11-02";
export const CONSENT_TEXT = [
  "I agree to review and sign this document electronically, and I understand that:",
  "1. My electronic signature (a typed name or a drawn image), confirmed by a one-time code sent to my email address, is a Tier-2 electronic signature. It can form a valid contract under section 10A of the Information Technology Act, 2000 where the law does not require a particular form.",
  "2. It is not an Aadhaar eSign and not a Digital Signature Certificate, and it does not carry the statutory presumption those have.",
  "3. Vaakil AI records my name, email address, IP address, browser details, the time of each step and the document's SHA-256 fingerprint in a tamper-evident audit trail and in the certificate of completion, which every party receives.",
  "4. I have been able to open and read the document identified by the SHA-256 fingerprint shown on this page, and my approval or signature applies only to that exact file.",
].join("\n");

export type DocCategory = {
  value: string;
  label: string;
  /** IT Act First Schedule exclusion: cannot be executed electronically. */
  excluded?: boolean;
  /** Shown before sending, for documents that also need stamping or registration. */
  warning?: string;
};

const STAMP_WARNING =
  "E-signing does not replace stamp duty or registration. Pay stamp duty (e-stamp) under the state Stamp Act and register the document where the Registration Act, 1908 requires it.";

export const DOC_CATEGORIES: DocCategory[] = [
  { value: "service_agreement", label: "Service or consultancy agreement" },
  { value: "engagement_letter", label: "Client engagement letter or fee agreement" },
  { value: "nda", label: "Non-disclosure agreement" },
  { value: "employment", label: "Employment or appointment letter" },
  { value: "settlement", label: "Settlement or compromise agreement" },
  { value: "mou", label: "Memorandum of understanding or term sheet" },
  { value: "loan_agreement", label: "Loan agreement (not a promissory note)", warning: STAMP_WARNING },
  { value: "partnership", label: "Partnership deed or LLP agreement", warning: STAMP_WARNING },
  { value: "lease_licence", label: "Lease or leave and licence agreement", warning: STAMP_WARNING },
  { value: "consent_letter", label: "Consent, authorisation or declaration letter" },
  { value: "other", label: "Other document (no special form required by law)" },
  { value: "will", label: "Will, codicil or other testamentary disposition", excluded: true },
  { value: "trust", label: "Trust deed (Indian Trusts Act, 1882)", excluded: true },
  {
    value: "negotiable_instrument",
    label: "Negotiable instrument other than a cheque (promissory note, bill of exchange)",
    excluded: true,
  },
  { value: "power_of_attorney", label: "Power of attorney", excluded: true },
  {
    value: "immovable_property",
    label: "Contract for sale or conveyance of immovable property (agreement to sell, sale deed, conveyance)",
    excluded: true,
  },
];

export const EXCLUDED_EXPLANATION =
  "The First Schedule to the Information Technology Act, 2000 (read with section 1(4)) keeps this kind of document out of electronic execution, so it cannot be signed here. Execute it on paper with the stamping, attestation and registration the law requires. The narrow carve-outs added in 2022 for instruments and powers of attorney in favour of RBI, SEBI, IRDAI, PFRDA or NHB-regulated entities are not offered here.";

export function findCategory(value: string): DocCategory | undefined {
  return DOC_CATEGORIES.find((c) => c.value === value);
}

export function isExcludedCategory(value: string): boolean {
  return Boolean(findCategory(value)?.excluded);
}
