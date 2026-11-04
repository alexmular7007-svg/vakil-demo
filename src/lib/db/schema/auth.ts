import { bigint, boolean, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

// Better Auth tables. Field names must match Better Auth's model (see getAuthTables);
// the drizzle client maps camelCase keys to snake_case columns.
export const appSchema = pgSchema("app");

export const user = appSchema.table("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  twoFactorEnabled: boolean().default(false),
  // admin plugin: "user" | "advocate" | "admin"
  role: text().default("user"),
  banned: boolean().default(false),
  banReason: text(),
  banExpires: timestamp({ withTimezone: true }),
  // additional fields
  phone: text(),
  locale: text().default("en"),
  persona: text().default("advocate"),
});

export const session = appSchema.table("session", {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text(),
});

export const account = appSchema.table("account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const verification = appSchema.table("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const twoFactor = appSchema.table("two_factor", {
  id: text().primaryKey(),
  secret: text().notNull(),
  backupCodes: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  verified: boolean().default(true),
  failedVerificationCount: integer().default(0),
  lockedUntil: timestamp({ withTimezone: true }),
});

// Better Auth's own rate limits (sign-in, sign-up, 2FA, password reset), stored in
// the database so the limits hold across every server instance. Server-only.
export const authRateLimit = appSchema.table("auth_rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});
