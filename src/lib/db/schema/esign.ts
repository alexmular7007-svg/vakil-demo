import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import * as E from "./enums";
import { oneOf } from "./types";

export const esignSchema = pgSchema("esign");

// Lifecycle: DRAFT -> LOCKED -> OUT_FOR_SIGNATURE -> PARTIALLY_SIGNED -> COMPLETED,
// with exits DECLINED, EXPIRED, VOIDED. The document hash is frozen at LOCKED.
export const envelopes = esignSchema.table(
  "envelopes",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text().notNull(),
    message: text(),
    // Category chosen at creation; excluded categories (IT Act First Schedule) are rejected.
    docCategory: text().notNull(),
    status: text().notNull().default("DRAFT"),
    // electronic (IT Act s.10A, OTP + audit trail) | aadhaar (licensed ESP via aggregator)
    signatureType: text().notNull().default("electronic"),
    provider: text().notNull().default("internal"),
    providerRef: text(),
    originalName: text().notNull(),
    originalStorageKey: text().notNull(),
    originalSha256: text().notNull(),
    lockedSha256: text(),
    finalStorageKey: text(),
    finalSha256: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lockedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.ownerId, t.updatedAt),
    check("envelopes_status_ck", oneOf(t.status, E.ENVELOPE_STATUSES)),
    check("envelopes_signature_type_ck", oneOf(t.signatureType, E.SIGNATURE_TYPES)),
  ],
);

export const recipients = esignSchema.table(
  "recipients",
  {
    id: uuid().primaryKey().defaultRandom(),
    envelopeId: uuid()
      .notNull()
      .references(() => envelopes.id, { onDelete: "cascade" }),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),
    // SENDER | RECEIVER | LAWYER | OTHER
    roleLabel: text().notNull(),
    // REVIEW | SIGN | WITNESS | CC
    action: text().notNull(),
    // Equal numbers act in parallel; higher numbers wait.
    routingOrder: integer().notNull().default(1),
    // PENDING | SENT | VIEWED | APPROVED | SIGNED | DECLINED
    status: text().notNull().default("PENDING"),
    authMethod: text().notNull().default("email_otp"),
    // SHA-256 of the signer's link token; the token itself is only ever emailed.
    accessTokenHash: text().notNull(),
    // For the LAWYER role: the verified advocate account, if any.
    advocateUserId: text(),
    signatureKind: text(),
    signatureText: text(),
    signatureImage: text(),
    signedSha256: text(),
    actedAt: timestamp({ withTimezone: true }),
    ip: text(),
    userAgent: text(),
    declineReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.envelopeId),
    // Signer links are looked up by token hash on every visit.
    uniqueIndex("recipients_access_token_hash_uq").on(t.accessTokenHash),
    check("recipients_role_ck", oneOf(t.roleLabel, E.RECIPIENT_ROLES)),
    check("recipients_action_ck", oneOf(t.action, E.RECIPIENT_ACTIONS)),
    check("recipients_status_ck", oneOf(t.status, E.RECIPIENT_STATUSES)),
  ],
);

export const otpCodes = esignSchema.table("otp_codes", {
  id: uuid().primaryKey().defaultRandom(),
  recipientId: uuid()
    .notNull()
    .references(() => recipients.id, { onDelete: "cascade" }),
  codeHash: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  attempts: integer().notNull().default(0),
  consumedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index().on(t.recipientId, t.createdAt)]);

// Append-only, hash-chained per envelope (update/delete blocked by trigger).
export const events = esignSchema.table(
  "events",
  {
    seq: bigserial({ mode: "number" }).primaryKey(),
    envelopeId: uuid()
      .notNull()
      .references(() => envelopes.id, { onDelete: "restrict" }),
    recipientId: uuid(),
    type: text().notNull(),
    documentSha256: text(),
    ip: text(),
    userAgent: text(),
    data: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    prevHash: text().notNull(),
    hash: text().notNull(),
  },
  (t) => [index().on(t.envelopeId, t.seq)],
);
