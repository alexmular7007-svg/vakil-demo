/**
 * Verifies the database security layer on the configured database (local or
 * Supabase): RLS, server-only tables, append-only and same-owner triggers.
 * Run with: npm run db:check   (exits 1 if anything is wrong)
 */
import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkDatabaseSecurity } from "@/lib/db/doctor";

async function main() {
  const report = await checkDatabaseSecurity(async (q) => {
    const r = (await db.execute(sql.raw(q))) as unknown;
    return (Array.isArray(r) ? r : (r as { rows: Record<string, unknown>[] }).rows) as Record<string, unknown>[];
  });
  if (report.ok) {
    console.log(`✓ Database security: all ${report.checks} checks passed`);
    process.exit(0);
  }
  console.error(`✗ Database security: ${report.findings.length} of ${report.checks} checks failed`);
  for (const f of report.findings) console.error(`  - ${f}`);
  console.error("Run `npm run db:migrate` to re-apply the security layer.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
