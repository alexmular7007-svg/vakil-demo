import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema, user } from "./auth";
import { oneOf, tsvector } from "./types";
import * as E from "./enums";

/* ----------------------------- billing ----------------------------- */
export const billingSchema = pgSchema("billing");

export const plans = billingSchema.table("plans", {
  id: text().primaryKey(),
  name: text().notNull(),
  tagline: text().notNull(),
  pricePaiseMonth: integer().notNull(),
  pricePaiseYear: integer().notNull(),
  features: jsonb().notNull(),
  // { dailySoftCap, dailyHardCap, monthlyCredits, modelTiers }
  limits: jsonb().notNull(),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
});

export const subscriptions = billingSchema.table(
  "subscriptions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: text()
      .notNull()
      .references(() => plans.id),
    // active | past_due | cancelled
    status: text().notNull(),
    interval: text().notNull().default("month"),
    periodStart: timestamp({ withTimezone: true }).notNull(),
    periodEnd: timestamp({ withTimezone: true }).notNull(),
    provider: text().notNull(),
    providerRef: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.userId),
    check("subscriptions_status_ck", oneOf(t.status, E.SUBSCRIPTION_STATUSES)),
    check("subscriptions_interval_ck", oneOf(t.interval, E.BILLING_INTERVALS)),
  ],
);

export const payments = billingSchema.table(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: text().references(() => plans.id),
    interval: text(),
    amountPaise: integer().notNull(),
    currency: text().notNull().default("INR"),
    provider: text().notNull(),
    providerOrderId: text().unique(),
    providerPaymentId: text(),
    // created | paid | failed
    status: text().notNull().default("created"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index().on(t.userId),
    check("payments_status_ck", oneOf(t.status, E.PAYMENT_STATUSES)),
    check("payments_amount_ck", sql`${t.amountPaise} >= 0`),
  ],
);

// Free trials of paid features (e.g. 15 days of daily legal updates). Written by the
// server on the owner connection; users can only read their own rows.
export const featureTrials = billingSchema.table(
  "feature_trials",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // legal_updates
    feature: text().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.feature] })],
);

// Every webhook is stored once (unique provider event id), so replays are ignored.
export const webhookEvents = billingSchema.table(
  "webhook_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    providerEventId: text().notNull(),
    type: text().notNull(),
    payload: jsonb().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [unique().on(t.provider, t.providerEventId)],
);

/* ----------------------------- privacy (DPDP) ----------------------------- */
export const privacySchema = pgSchema("privacy");

export const consents = privacySchema.table(
  "consents",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: text().notNull(),
    noticeVersion: text().notNull(),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.userId)],
);

export const rightsRequests = privacySchema.table(
  "rights_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // access | correction | erasure | withdraw_consent | grievance
    type: text().notNull(),
    details: text().notNull().default(""),
    // open | in_progress | resolved | rejected
    status: text().notNull().default("open"),
    response: text(),
    dueAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.userId)],
);

/* ----------------------------- audit ----------------------------- */
export const auditSchema = pgSchema("audit");

// Append-only hash chain: hash = SHA-256(prev_hash || canonical row).
// Update and delete are blocked by trigger and revoked from app roles.
export const auditEvents = auditSchema.table(
  "events",
  {
    seq: bigserial({ mode: "number" }).primaryKey(),
    at: timestamp({ withTimezone: true }).notNull(),
    actorId: text(),
    actorRole: text(),
    action: text().notNull(),
    entityType: text(),
    entityId: text(),
    ip: text(),
    data: jsonb(),
    prevHash: text().notNull(),
    hash: text().notNull(),
  },
  (t) => [index().on(t.entityType, t.entityId), index().on(t.actorId)],
);

/* ----------------------------- corpus ----------------------------- */
export const corpusSchema = pgSchema("corpus");

export const acts = corpusSchema.table("acts", {
  id: text().primaryKey(), // e.g. "BNS"
  title: text().notNull(),
  shortTitle: text().notNull(),
  actNo: text(),
  year: integer().notNull(),
  inForceFrom: date(),
  repealedOn: date(),
  replacedBy: text(),
  sourceUrl: text().notNull(),
  sourceNote: text(),
  // Official-source sync (India Code). tracked = checked by the updates job.
  tracked: boolean().notNull().default(true),
  sourceVersion: text(),
  lastSyncedAt: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true }),
});

export const sections = corpusSchema.table(
  "sections",
  {
    id: uuid().primaryKey().defaultRandom(),
    actId: text()
      .notNull()
      .references(() => acts.id, { onDelete: "cascade" }),
    sectionNo: text().notNull(),
    sortKey: integer().notNull(),
    heading: text().notNull(),
    chapter: text(),
    text: text().notNull(),
    tsv: tsvector().generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(heading, '') || ' ' || coalesce(text, ''))`,
    ),
  },
  (t) => [
    unique().on(t.actId, t.sectionNo),
    index("sections_tsv_idx").using("gin", t.tsv),
  ],
);

// Old code -> new code correspondence (IPC->BNS, CrPC->BNSS, IEA->BSA).
// Rows are imported only from a cited official source.
export const codeMap = corpusSchema.table(
  "code_map",
  {
    id: uuid().primaryKey().defaultRandom(),
    oldAct: text().notNull(),
    oldSection: text().notNull(),
    newAct: text().notNull(),
    newSection: text().notNull(),
    subject: text(),
    note: text(),
    source: text().notNull(),
  },
  (t) => [index().on(t.oldAct, t.oldSection), index().on(t.newAct, t.newSection)],
);

export const judgments = corpusSchema.table(
  "judgments",
  {
    id: uuid().primaryKey().defaultRandom(),
    court: text().notNull(),
    title: text().notNull(),
    decidedOn: date(),
    citation: text(),
    caseNo: text(),
    bench: text(),
    sourceUrl: text(),
    licence: text().notNull().default("CC-BY-4.0"),
    // Where the record came from: an open dataset key, or "upload" (added by an admin).
    sourceKey: text().notNull().default("upload"),
    externalId: text(),
    parties: text(),
    summary: text(),
    addedBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.court, t.decidedOn), unique().on(t.sourceKey, t.externalId)],
);

export const judgmentParas = corpusSchema.table(
  "judgment_paras",
  {
    id: uuid().primaryKey().defaultRandom(),
    judgmentId: uuid()
      .notNull()
      .references(() => judgments.id, { onDelete: "cascade" }),
    paraNo: integer().notNull(),
    text: text().notNull(),
    tsv: tsvector().generatedAlwaysAs(sql`to_tsvector('english', text)`),
  },
  (t) => [index("judgment_paras_tsv_idx").using("gin", t.tsv), index().on(t.judgmentId)],
);

// Every change to a section's text, from an India Code sync or an admin edit.
// Append-only (see security.sql): the history of the law as this app showed it.
export const sectionRevisions = corpusSchema.table(
  "section_revisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    actId: text().notNull(),
    sectionNo: text().notNull(),
    // null before = the section was added; null after = it was removed
    beforeHeading: text(),
    beforeText: text(),
    afterHeading: text(),
    afterText: text(),
    // india_code | admin
    source: text().notNull(),
    sourceRef: text(),
    changedBy: text().notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.actId, t.sectionNo), index().on(t.createdAt), check("section_revisions_source_ck", oneOf(t.source, E.REVISION_SOURCES))],
);

// Bills, acts, amendments, notifications, judgments and news from configured
// sources. Headline, link and a short description only; never full articles.
export const legalUpdates = corpusSchema.table(
  "legal_updates",
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceKey: text().notNull(),
    sourceName: text().notNull(),
    // act | amendment | bill | ordinance | notification | judgment | news
    kind: text().notNull(),
    title: text().notNull(),
    summary: text(),
    url: text().notNull(),
    publishedAt: timestamp({ withTimezone: true }),
    // high (pop-up) | normal (list only)
    importance: text().notNull().default("normal"),
    acts: text().array().notNull().default(sql`'{}'::text[]`),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.url),
    index().on(t.publishedAt),
    index().on(t.importance, t.createdAt),
    check("legal_updates_kind_ck", oneOf(t.kind, E.UPDATE_KINDS)),
    check("legal_updates_importance_ck", oneOf(t.importance, E.UPDATE_IMPORTANCE)),
  ],
);

export const syncRuns = corpusSchema.table(
  "sync_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    // india_code | feeds | judgments
    kind: text().notNull(),
    // running | ok | partial | failed
    status: text().notNull().default("running"),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    summary: jsonb().$type<Record<string, unknown>>(),
    error: text(),
  },
  (t) => [index().on(t.kind, t.startedAt), check("sync_runs_kind_ck", oneOf(t.kind, E.SYNC_KINDS)), check("sync_runs_status_ck", oneOf(t.status, E.SYNC_STATUSES))],
);

// When each user last saw the legal-updates feed (drives the pop-up).
export const updateReceipts = appSchema.table("update_receipts", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
