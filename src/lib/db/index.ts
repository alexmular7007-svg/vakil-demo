import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

function connect(): Db {
  if (env.DATABASE_URL) {
    // prepare:false keeps the client compatible with Supabase's transaction pooler.
    const client = postgres(env.DATABASE_URL, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
    return drizzlePostgres({ client, schema, casing: "snake_case" }) as unknown as Db;
  }
  mkdirSync(dirname(env.PGLITE_DIR), { recursive: true });
  const client = new PGlite(env.PGLITE_DIR);
  return drizzlePglite({ client, schema, casing: "snake_case" }) as unknown as Db;
}

const g = globalThis as unknown as { __vaakilDb?: Db };

/** Owner connection. Use only in server-only service code that performs its own
 *  authorization (auth library, webhooks, admin, e-sign signer portal, audit). */
export const db: Db = g.__vaakilDb ?? (g.__vaakilDb = connect());

/**
 * Run queries as the signed-in user. The transaction switches to the non-owner
 * `app_user` role and sets `app.user_id`, so Postgres row-level security limits
 * every statement to that user's rows even if application code has a bug.
 * `userId` must come from the verified session, never from request input.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>, opts?: { timeoutMs?: number }): Promise<T> {
  if (!userId) throw new Error("withUser needs the signed-in user's id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_user`);
    // One round trip: the user for RLS, and a statement time limit so one slow
    // query cannot hold a connection (and the pool) indefinitely.
    await tx.execute(
      sql`select set_config('app.user_id', ${userId}, true), set_config('statement_timeout', ${String(opts?.timeoutMs ?? USER_STATEMENT_TIMEOUT_MS)}, true)`,
    );
    return fn(tx as unknown as Tx);
  });
}

/** Default per-statement limit inside withUser (milliseconds). */
export const USER_STATEMENT_TIMEOUT_MS = 15_000;

export { schema };
