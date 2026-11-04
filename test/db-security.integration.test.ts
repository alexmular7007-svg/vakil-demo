// Database security layer against an isolated in-memory PGlite: every migration plus
// security.sql, then the doctor report, cross-user isolation, same-owner references,
// CHECK constraints and append-only history. No app modules: plain SQL only.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { checkDatabaseSecurity } from "@/lib/db/doctor";

const root = path.resolve(import.meta.dirname, "..");
let pg: PGlite;

const q = async (sql: string, params: unknown[] = []) => (await pg.query<Record<string, unknown>>(sql, params)).rows;

/** Runs statements as app_user with app.user_id set, like withUser() does. */
async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await pg.exec("begin");
  try {
    await pg.exec("set local role app_user");
    await pg.query("select set_config('app.user_id', $1, true)", [userId]);
    const out = await fn();
    await pg.exec("commit");
    return out;
  } catch (e) {
    await pg.exec("rollback");
    throw e;
  }
}

beforeAll(async () => {
  pg = new PGlite();
  for (const f of readdirSync(path.join(root, "drizzle")).filter((n) => n.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(path.join(root, "drizzle", f), "utf8"));
  }
  await pg.exec(readFileSync(path.join(root, "src/lib/db/sql/security.sql"), "utf8"));
  for (const id of ["user-a", "user-b"]) {
    await q(`insert into app."user" (id, name, email) values ($1, $1, $1 || '@example.test')`, [id]);
  }
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("database security layer", () => {
  it("passes the doctor checks", async () => {
    const report = await checkDatabaseSecurity((sql) => q(sql));
    expect(report.findings).toEqual([]);
    expect(report.checks).toBeGreaterThan(50);
  });

  it("keeps each user's rows private", async () => {
    const [m] = await asUser("user-a", () => q(`insert into app.matters (owner_id, title) values ('user-a', 'A matter') returning id`));
    const seenByB = await asUser("user-b", () => q(`select id from app.matters where id = $1`, [m.id]));
    expect(seenByB).toEqual([]);
    const seenByA = await asUser("user-a", () => q(`select id from app.matters where id = $1`, [m.id]));
    expect(seenByA).toHaveLength(1);
    await expect(asUser("user-b", () => q(`insert into app.matters (owner_id, title) values ('user-a', 'forged')`))).rejects.toThrow();
  });

  it("refuses references to another user's rows, even on the owner connection", async () => {
    const [m] = await asUser("user-a", () => q(`insert into app.matters (owner_id, title) values ('user-a', 'A2') returning id`));
    // As app_user: RLS hides A's matter, so B cannot link to it.
    await expect(
      asUser("user-b", () => q(`insert into app.hearings (owner_id, case_title, hearing_date, matter_id) values ('user-b', 'x', '2026-11-04', $1)`, [m.id])),
    ).rejects.toThrow(/same user/);
    // Owner connection (service code) is checked too.
    await expect(
      q(`insert into app.hearings (owner_id, case_title, hearing_date, matter_id) values ('user-b', 'x', '2026-11-04', $1)`, [m.id]),
    ).rejects.toThrow(/same user/);
    // Same owner is fine.
    const ok = await asUser("user-a", () =>
      q(`insert into app.hearings (owner_id, case_title, hearing_date, matter_id) values ('user-a', 'ok', '2026-11-04', $1) returning id`, [m.id]),
    );
    expect(ok).toHaveLength(1);
  });

  it("rejects values outside the allowed lists and negative money", async () => {
    await expect(asUser("user-a", () => q(`insert into app.matters (owner_id, title, status) values ('user-a', 't', 'archived')`))).rejects.toThrow(
      /matters_status_ck/,
    );
    await expect(
      asUser("user-a", () =>
        q(`insert into app.invoices (owner_id, number, issue_date, bill_to, items, subtotal_paise, total_paise)
           values ('user-a', 'INV/1', '2026-11-03', '{"name":"x"}', '[]', -100, -100)`),
      ),
    ).rejects.toThrow(/invoices_amounts_ck/);
  });

  it("keeps statute history append-only", async () => {
    await q(`insert into corpus.acts (id, title, short_title, year, source_url) values ('TST', 'Test Act', 'Test', 2026, 'https://example.test')`);
    const [r] = await q(
      `insert into corpus.section_revisions (act_id, section_no, after_heading, after_text, source, changed_by) values ('TST', '1', 'h', 't', 'admin', 'x') returning id`,
    );
    await expect(q(`update corpus.section_revisions set note = 'edited' where id = $1`, [r.id])).rejects.toThrow(/append-only/);
    await expect(q(`delete from corpus.section_revisions where id = $1`, [r.id])).rejects.toThrow(/append-only/);
  });

  it("reports a table that loses row-level security", async () => {
    await pg.exec("alter table app.hearings disable row level security");
    const report = await checkDatabaseSecurity((sql) => q(sql));
    expect(report.findings).toContain("app.hearings: row-level security is not enabled");
    await pg.exec("alter table app.hearings enable row level security");
  });
});
