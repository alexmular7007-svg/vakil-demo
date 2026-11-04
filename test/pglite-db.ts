// Isolated in-memory PostgreSQL (PGlite) for integration tests, standing in for
// "@/lib/db". Two ways to use it:
//
// 1. Same behaviour as src/lib/db, including withUser() with row-level security:
//      vi.mock("@/lib/db", async () => (await import("../../../test/pglite-db")).createTestDbModule());
//      … then in beforeAll: await migrateTestDb(db); await seedTestPlans(db); afterAll: closeTestDb(db)
//
// 2. Already migrated, for owner-connection service code (corpus, sync runs):
//      vi.mock("@/lib/db", async () => (await import("../../../test/pglite-db")).mockDbModule());
//    Its withUser runs fn on the owner connection without a transaction: PGlite has one
//    connection, so owner queries inside a real withUser transaction would wait on themselves.
//
// Nothing here touches the development database.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";
import type { Db, Tx } from "@/lib/db";
import { allPlans } from "@/lib/plans";

const root = path.resolve(import.meta.dirname, "..");
const USER_STATEMENT_TIMEOUT_MS = 15_000;

function clientOf(db: unknown): PGlite {
  const client = (db as { $client?: PGlite }).$client;
  if (!client) throw new Error("not a PGlite test database");
  return client;
}

function newDb(): Db {
  return drizzle({ client: new PGlite(), schema, casing: "snake_case" }) as unknown as Db;
}

/** Every migration in drizzle/ plus security.sql (roles, grants, RLS, triggers). */
export async function migrateTestDb(db: Db | unknown): Promise<void> {
  const pg = clientOf(db);
  for (const f of readdirSync(path.join(root, "drizzle")).filter((n) => n.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(path.join(root, "drizzle", f), "utf8"));
  }
  await pg.exec(readFileSync(path.join(root, "src/lib/db/sql/security.sql"), "utf8"));
}

/** The plan catalogue, as `npm run db:seed` stores it. */
export async function seedTestPlans(db: Db | unknown): Promise<void> {
  const d = db as Db;
  for (const [i, p] of allPlans.entries()) {
    const row = {
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      pricePaiseMonth: p.pricePaiseMonth,
      pricePaiseYear: p.pricePaiseYear,
      features: p.features,
      limits: p.limits,
      sortOrder: i,
      isActive: true,
    };
    await d.insert(schema.plans).values(row).onConflictDoUpdate({ target: schema.plans.id, set: row });
  }
}

export async function closeTestDb(db: Db | unknown): Promise<void> {
  await clientOf(db).close();
}

/** A stand-in for "@/lib/db" with the real withUser (app_user role + app.user_id). Not migrated yet. */
export async function createTestDbModule() {
  const db = newDb();
  async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>, opts?: { timeoutMs?: number }): Promise<T> {
    if (!userId) throw new Error("withUser needs the signed-in user's id");
    return db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_user`);
      await tx.execute(
        sql`select set_config('app.user_id', ${userId}, true), set_config('statement_timeout', ${String(opts?.timeoutMs ?? USER_STATEMENT_TIMEOUT_MS)}, true)`,
      );
      return fn(tx as unknown as Tx);
    });
  }
  return { db, withUser, USER_STATEMENT_TIMEOUT_MS, schema };
}

/** Migrated database and its raw client, for owner-connection service code. */
export async function createTestDb() {
  const db = newDb();
  await migrateTestDb(db);
  return { pg: clientOf(db), db };
}

/** A stand-in for "@/lib/db", already migrated; `__pg` gives tests raw SQL access. */
export async function mockDbModule() {
  const { pg, db } = await createTestDb();
  return {
    db,
    withUser: async <T>(_userId: string, fn: (tx: Tx) => Promise<T>) => fn(db as unknown as Tx),
    USER_STATEMENT_TIMEOUT_MS,
    schema,
    __pg: pg,
  };
}

export type TestDbModule = Awaited<ReturnType<typeof mockDbModule>>;
