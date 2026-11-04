/**
 * Applies Drizzle migrations, then the idempotent security layer (roles, RLS,
 * append-only triggers). Run with: npm run db:migrate
 */
import "./load-env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

async function main() {

  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder });
  }
  console.log("✓ migrations applied");

  const security = await readFile(path.join(process.cwd(), "src/lib/db/sql/security.sql"), "utf8");
  // Multi-statement script: needs the simple query protocol, not a prepared statement.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (db as any).$client;
  if (process.env.DATABASE_URL) await client.unsafe(security);
  else await client.exec(security);
  await db.execute(sql`select 1`);
  console.log("✓ security layer applied (roles, RLS, append-only triggers)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
