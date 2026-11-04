import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { appSchema, user } from "./auth";
import { oneOf, tsvector } from "./types";
import * as E from "./enums";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

const ownerId = () =>
  text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

// Advocate identity. The "Lawyer" e-sign role and the public directory require
// verification_status = 'verified', set only by an admin after checking the
// enrolment with the State Bar Council.
export const advocateProfiles = appSchema.table("advocate_profiles", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text().notNull(),
  enrolmentNo: text().notNull(),
  stateBarCouncil: text().notNull(),
  enrolmentYear: integer(),
  practiceAreas: text().array().notNull().default(sql`'{}'::text[]`),
  courts: text().array().notNull().default(sql`'{}'::text[]`),
  languages: text().array().notNull().default(sql`'{}'::text[]`),
  city: text(),
  state: text(),
  bio: text(),
  // pending | verified | rejected
  verificationStatus: text().notNull().default("pending"),
  verifiedBy: text(),
  verifiedAt: timestamp({ withTimezone: true }),
  rejectionReason: text(),
  // Advocate opts in to the public, unranked directory.
  isListed: boolean().notNull().default(false),
  acceptsConsultations: boolean().notNull().default(false),
  ...timestamps,
}, (t) => [check("advocate_profiles_status_ck", oneOf(t.verificationStatus, E.VERIFICATION_STATUSES))]);

export const matters = appSchema.table(
  "matters",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: ownerId(),
    title: text().notNull(),
    clientName: text(),
    court: text(),
    caseNo: text(),
    // eCourts Case Number Record (16 characters), for the "Open on eCourts" link.
    cnr: text(),
    clientId: uuid().references(() => clients.id, { onDelete: "set null" }),
    // Used by the conflict check.
    opposingParty: text(),
    // Decides IPC vs BNS (offences before 1 July 2024 stay under the IPC).
    offenceDate: date(),
    // open | closed
    status: text().notNull().default("open"),
    notes: text(),
    ...timestamps,
  },
  (t) => [index().on(t.ownerId), check("matters_status_ck", oneOf(t.status, E.MATTER_STATUSES))],
);

export const documents = appSchema.table(
  "documents",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: ownerId(),
    matterId: uuid().references(() => matters.id, { onDelete: "set null" }),
    name: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    sha256: text().notNull(),
    storageKey: text().notNull(),
    pageCount: integer(),
    textContent: text(),
    // processing | ready | failed
    status: text().notNull().default("processing"),
    error: text(),
    ...timestamps,
  },
  (t) => [index().on(t.ownerId), index().on(t.matterId), check("documents_status_ck", oneOf(t.status, E.DOCUMENT_STATUSES))],
);

export const documentChunks = appSchema.table(
  "document_chunks",
  {
    id: uuid().primaryKey().defaultRandom(),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
    idx: integer().notNull(),
    content: text().notNull(),
    tsv: tsvector().generatedAlwaysAs(sql`to_tsvector('simple', content)`),
  },
  (t) => [index().on(t.documentId), index("document_chunks_tsv_idx").using("gin", t.tsv)],
);

export const chats = appSchema.table(
  "chats",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: ownerId(),
    title: text().notNull().default("New conversation"),
    matterId: uuid().references(() => matters.id, { onDelete: "set null" }),
    assistantId: uuid(),
    // research | draft | general
    mode: text().notNull().default("research"),
    language: text().notNull().default("en"),
    pinned: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [index().on(t.ownerId, t.updatedAt), check("chats_mode_ck", oneOf(t.mode, E.CHAT_MODES))],
);

export const messages = appSchema.table(
  "messages",
  {
    id: text().primaryKey(),
    chatId: uuid()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
    role: text().notNull(),
    parts: jsonb().notNull(),
    // [{ id, kind, label, ref, verified }]
    citations: jsonb(),
    provider: text(),
    model: text(),
    tokensIn: integer(),
    tokensOut: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.chatId, t.createdAt)],
);

// Drafting templates are global and public. Every published template carries
// the advocate who reviewed it.
export const templates = appSchema.table("templates", {
  slug: text().primaryKey(),
  title: text().notNull(),
  titleHi: text(),
  category: text().notNull(),
  summary: text().notNull(),
  // Form schema for the intake wizard: [{ name, label, type, required, options, help }]
  fields: jsonb().notNull(),
  bodyEn: text().notNull(),
  bodyHi: text(),
  // Statutes the template relies on, e.g. ["NI Act s.138", "BNSS s.480"]
  lawRefs: text().array().notNull().default(sql`'{}'::text[]`),
  // Documents that can never be e-signed (wills, trusts, POA, negotiable instruments)
  esignAllowed: boolean().notNull().default(true),
  reviewedBy: text(),
  reviewedAt: timestamp({ withTimezone: true }),
  isPublished: boolean().notNull().default(true),
  ...timestamps,
});

export const drafts = appSchema.table(
  "drafts",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: ownerId(),
    matterId: uuid().references(() => matters.id, { onDelete: "set null" }),
    templateSlug: text().references(() => templates.slug),
    title: text().notNull(),
    language: text().notNull().default("en"),
    inputs: jsonb().notNull().default(sql`'{}'::jsonb`),
    body: text().notNull().default(""),
    // draft | final
    status: text().notNull().default("draft"),
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [index().on(t.ownerId, t.updatedAt), check("drafts_status_ck", oneOf(t.status, E.DRAFT_STATUSES))],
);

// Immutable history: every save of a draft writes a version with its hash.
export const draftVersions = appSchema.table(
  "draft_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    draftId: uuid()
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
    version: integer().notNull(),
    body: text().notNull(),
    sha256: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.draftId, t.version)],
);

// "Ask a verified advocate" hand-off from a chat or matter.
export const consultations = appSchema.table(
  "consultations",
  {
    id: uuid().primaryKey().defaultRandom(),
    requesterId: ownerId(),
    advocateId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chatId: uuid().references(() => chats.id, { onDelete: "set null" }),
    subject: text().notNull(),
    summary: text().notNull(),
    // requested | accepted | declined | closed
    status: text().notNull().default("requested"),
    advocateNote: text(),
    ...timestamps,
  },
  (t) => [index().on(t.requesterId), index().on(t.advocateId), check("consultations_status_ck", oneOf(t.status, E.CONSULTATION_STATUSES))],
);

// ---------------------------------------------------------------------------
// Practice management: clients, case diary, tasks, fee book
// ---------------------------------------------------------------------------

export const clients = appSchema.table(
  "clients",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: ownerId(),
    name: text().notNull(),
    // individual | business (business clients pay GST on legal fees under reverse charge)
    kind: text().notNull().default("individual"),
    phone: text(),
    email: text(),
    address: text(),
    gstin: text(),
    notes: text(),
    ...timestamps,
  },
  (t) => [index().on(t.ownerId, t.name), check("clients_kind_ck", oneOf(t.kind, E.CLIENT_KINDS))],
);

// Advocate's diary: one row per listed date. Recording the outcome of a hearing
// can create the next one (next_hearing_id links the chain).
export const hearings = appSchema.table(
  "hearings",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: ownerId(),
    matterId: uuid().references(() => matters.id, { onDelete: "set null" }),
    caseTitle: text().notNull(),
    court: text(),
    // Court hall, bench or judge
    bench: text(),
    caseNo: text(),
    cnr: text(),
    hearingDate: date().notNull(),
    // "10:30"; optional
    hearingTime: text(),
    itemNo: text(),
    // Stage / purpose, e.g. "Arguments", "Evidence"
    purpose: text(),
    notes: text(),
    // scheduled | done | adjourned | cancelled
    status: text().notNull().default("scheduled"),
    outcome: text(),
    nextHearingId: uuid(),
    ...timestamps,
  },
  (t) => [index().on(t.ownerId, t.hearingDate), index().on(t.matterId), check("hearings_status_ck", oneOf(t.status, E.HEARING_STATUSES))],
);

export const tasks = appSchema.table(
  "tasks",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: ownerId(),
    matterId: uuid().references(() => matters.id, { onDelete: "set null" }),
    title: text().notNull(),
    dueDate: date(),
    done: boolean().notNull().default(false),
    doneAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.ownerId, t.done, t.dueDate)],
);

// Letterhead and billing details used on fee invoices and receipts.
export const practiceProfiles = appSchema.table("practice_profiles", {
  ownerId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text(),
  address: text(),
  phone: text(),
  email: text(),
  gstin: text(),
  // UPI VPA for the "Pay by UPI" link on invoices, e.g. name@bank
  upiId: text(),
  invoicePrefix: text().notNull().default("INV"),
  ...timestamps,
});

// Amounts are integer paise.
export const invoices = appSchema.table(
  "invoices",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: ownerId(),
    clientId: uuid().references(() => clients.id, { onDelete: "set null" }),
    matterId: uuid().references(() => matters.id, { onDelete: "set null" }),
    number: text().notNull(),
    issueDate: date().notNull(),
    dueDate: date(),
    billTo: jsonb().$type<{ name: string; address?: string; gstin?: string; email?: string }>().notNull(),
    items: jsonb().$type<{ description: string; amountPaise: number }[]>().notNull(),
    subtotalPaise: bigint({ mode: "number" }).notNull(),
    // none | forward (advocate charges GST) | reverse_charge (business recipient pays GST)
    gstMode: text().notNull().default("none"),
    // basis points: 1800 = 18%
    gstRateBp: integer().notNull().default(0),
    taxPaise: bigint({ mode: "number" }).notNull().default(0),
    totalPaise: bigint({ mode: "number" }).notNull(),
    // draft | issued | partly_paid | paid | cancelled
    status: text().notNull().default("issued"),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.ownerId, t.number),
    index().on(t.ownerId, t.issueDate),
    index().on(t.clientId),
    check("invoices_status_ck", oneOf(t.status, E.INVOICE_STATUSES)),
    check("invoices_gst_mode_ck", oneOf(t.gstMode, E.GST_MODES)),
    check("invoices_amounts_ck", sql`${t.subtotalPaise} >= 0 and ${t.taxPaise} >= 0 and ${t.totalPaise} >= 0 and ${t.gstRateBp} between 0 and 2800`),
  ],
);

export const feeReceipts = appSchema.table(
  "fee_receipts",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: ownerId(),
    invoiceId: uuid().references(() => invoices.id, { onDelete: "cascade" }),
    clientId: uuid().references(() => clients.id, { onDelete: "set null" }),
    amountPaise: bigint({ mode: "number" }).notNull(),
    receivedOn: date().notNull(),
    // cash | upi | bank | cheque | other
    mode: text().notNull().default("upi"),
    reference: text(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.ownerId, t.receivedOn), index().on(t.invoiceId), check("fee_receipts_mode_ck", oneOf(t.mode, E.RECEIPT_MODES)), check("fee_receipts_amount_ck", sql`${t.amountPaise} > 0`)],
);

// Emails in development (no provider configured). Server-only; never exposed in production.
export const outbox = appSchema.table("outbox", {
  id: uuid().primaryKey().defaultRandom(),
  to: text().notNull(),
  subject: text().notNull(),
  text: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = appSchema.table(
  "rate_limits",
  {
    key: text().notNull(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
