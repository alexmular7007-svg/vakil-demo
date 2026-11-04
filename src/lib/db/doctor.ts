// Database security self-check. Verifies, against the live catalog, the guarantees
// the app relies on: row-level security on every user table, no app_user access to
// server-only tables, append-only and same-owner triggers in place, and read-only
// reference data. Used by `npm run db:check`, the admin console and the test suite.
// Takes a plain query function so it runs on postgres-js, PGlite or a test client.

export type QueryFn = (sql: string) => Promise<Record<string, unknown>[]>;
export type DoctorReport = { ok: boolean; checks: number; findings: string[] };

/** User-facing schemas: every table here is either RLS-protected or server-only. */
const USER_SCHEMAS = ["app", "ai", "esign", "billing", "privacy"];

/** Tables only server code (owner connection) may touch; app_user gets no privileges. */
export const SERVER_ONLY_TABLES = [
  "app.user",
  "app.session",
  "app.account",
  "app.verification",
  "app.two_factor",
  "app.outbox",
  "app.rate_limits",
  "app.auth_rate_limit",
  "ai.settings",
  "esign.otp_codes",
  "billing.webhook_events",
];

export const APPEND_ONLY_TABLES = ["audit.events", "esign.events", "app.draft_versions", "corpus.section_revisions"];

export const SAME_OWNER_TRIGGERS: [table: string, column: string][] = [
  ["app.matters", "client_id"],
  ["app.documents", "matter_id"],
  ["app.document_chunks", "document_id"],
  ["app.chats", "matter_id"],
  ["app.messages", "chat_id"],
  ["app.drafts", "matter_id"],
  ["app.draft_versions", "draft_id"],
  ["app.consultations", "chat_id"],
  ["app.hearings", "matter_id"],
  ["app.tasks", "matter_id"],
  ["app.invoices", "client_id"],
  ["app.invoices", "matter_id"],
  ["app.fee_receipts", "invoice_id"],
  ["app.fee_receipts", "client_id"],
];

const quoteList = (xs: string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(", ");

export async function checkDatabaseSecurity(query: QueryFn): Promise<DoctorReport> {
  const findings: string[] = [];
  let checks = 0;
  const check = (pass: boolean, message: string) => {
    checks++;
    if (!pass) findings.push(message);
  };

  const role = await query(`select rolsuper, rolbypassrls from pg_roles where rolname = 'app_user'`);
  check(role.length === 1, "role app_user is missing");
  if (role[0]) check(!role[0].rolsuper && !role[0].rolbypassrls, "app_user must not be superuser or bypass RLS");

  const tables = await query(`
    select n.nspname || '.' || c.relname as name, c.relrowsecurity as rls,
      (select count(*) from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname and 'app_user' = any(p.roles))::int as policies,
      has_table_privilege('app_user', c.oid, 'SELECT') as can_select,
      has_table_privilege('app_user', c.oid, 'INSERT,UPDATE,DELETE') as can_write
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in (${quoteList([...USER_SCHEMAS, "corpus", "audit"])})`);

  for (const t of tables) {
    const name = String(t.name);
    const schema = name.split(".")[0];
    if (schema === "audit") {
      check(!t.can_select && !t.can_write, `${name}: app_user must not access the audit log`);
    } else if (schema === "corpus") {
      check(!t.can_write, `${name}: reference data must be read-only for app_user`);
    } else if (SERVER_ONLY_TABLES.includes(name)) {
      check(!t.can_select && !t.can_write, `${name}: server-only table is accessible to app_user`);
    } else {
      check(Boolean(t.rls), `${name}: row-level security is not enabled`);
      if (t.rls && (t.can_select || t.can_write)) check(Number(t.policies) > 0, `${name}: RLS is on but no policy grants app_user access`);
    }
  }

  const triggers = await query(`
    select n.nspname || '.' || c.relname as tbl, t.tgname as name
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal`);
  const has = (tbl: string, name: string) => triggers.some((r) => r.tbl === tbl && r.name === name);
  for (const tbl of APPEND_ONLY_TABLES) check(has(tbl, "append_only"), `${tbl}: append-only trigger is missing`);
  for (const [tbl, col] of SAME_OWNER_TRIGGERS) check(has(tbl, `same_owner_${col}`), `${tbl}.${col}: same-owner trigger is missing`);
  check(has("esign.envelopes", "protect_envelope"), "esign.envelopes: hash protection trigger is missing");

  return { ok: findings.length === 0, checks, findings };
}
