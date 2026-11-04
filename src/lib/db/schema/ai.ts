import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import * as E from "./enums";
import { oneOf } from "./types";

export const aiSchema = pgSchema("ai");

// Saved prompts. owner_id NULL = Vaakil's built-in library (read-only for users).
export const prompts = aiSchema.table(
  "prompts",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text().references(() => user.id, { onDelete: "cascade" }),
    title: text().notNull(),
    body: text().notNull(),
    category: text().notNull().default("General"),
    // private | public
    visibility: text().notNull().default("private"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.ownerId), check("prompts_visibility_ck", oneOf(t.visibility, E.PROMPT_VISIBILITIES))],
);

// User-built assistants ("create your own GPT"). Instructions are always placed
// below Vaakil's fixed safety rules and never override them.
export const assistants = aiSchema.table(
  "assistants",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text().notNull().default(""),
    instructions: text().notNull(),
    // fast | standard | pro
    modelTier: text().notNull().default("standard"),
    knowledgeDocumentIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    icon: text().notNull().default("scale"),
    version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.ownerId)],
);

// Per-user daily usage for fair-use limits and cost tracking.
export const usageLedger = aiSchema.table(
  "usage_ledger",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date().notNull(),
    queries: integer().notNull().default(0),
    tokensIn: bigint({ mode: "number" }).notNull().default(0),
    tokensOut: bigint({ mode: "number" }).notNull().default(0),
    // Estimated provider cost in micro-USD.
    costMicros: bigint({ mode: "number" }).notNull().default(0),
  },
  (t) => [unique().on(t.userId, t.day)],
);

export const feedback = aiSchema.table("feedback", {
  id: uuid().primaryKey().defaultRandom(),
  messageId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // up | down
  rating: text().notNull(),
  reason: text(),
  comment: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Admin-editable runtime settings (model routing, fair-use thresholds).
export const settings = aiSchema.table("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedBy: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
