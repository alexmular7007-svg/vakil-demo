import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkDatabaseSecurity } from "@/lib/db/doctor";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { features } from "@/lib/env";
import { adminOverview, formatUsdMicros } from "@/lib/admin/stats";
import { paymentsConfigured } from "@/lib/payments/provider";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { StatCard } from "@/components/admin/stat-card";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

const integrations = [
  { key: "ai", label: "AI provider", on: () => features.ai },
  { key: "email", label: "Email (Resend or SMTP / Gmail)", on: () => features.email },
  { key: "google", label: "Sign in with Google", on: () => features.googleSignIn },
  { key: "payments", label: "CGPEY payments", on: () => paymentsConfigured() },
  { key: "kyc", label: "CGPEY KYC", on: () => features.cgpeyKyc },
  { key: "esign", label: "Aadhaar eSign aggregator", on: () => features.aadhaarEsign },
  { key: "directory", label: "Company directory", on: () => features.directory },
];

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const [s, dbReport] = await Promise.all([
    adminOverview(),
    checkDatabaseSecurity(async (q) => {
      const r = (await db.execute(sql.raw(q))) as unknown;
      return (Array.isArray(r) ? r : (r as { rows: Record<string, unknown>[] }).rows) as Record<string, unknown>[];
    }),
  ]);
  const totalEnvelopes = s.envelopes.reduce((a, r) => a + r.n, 0);

  return (
    <div className="space-y-8">
      <PageHeader title="Overview" description="Live figures from the database. Costs are provider list-price estimates in US dollars." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={s.users.toLocaleString("en-IN")} sub={s.banned ? `${s.banned} banned` : "None banned"} href="/admin/users" />
        <StatCard
          label="Pending verifications"
          value={s.pendingVerifications}
          sub={`${s.verifiedAdvocates} verified advocates`}
          href="/admin/verifications"
          tone={s.pendingVerifications > 0 ? "warning" : "default"}
        />
        <StatCard
          label="AI cost today (IST)"
          value={formatUsdMicros(s.aiToday.costMicros)}
          sub={`${s.aiToday.queries.toLocaleString("en-IN")} questions · ${s.aiToday.users} users`}
          href="/admin/ai"
        />
        <StatCard
          label="AI cost, last 30 days"
          value={formatUsdMicros(s.ai30.costMicros)}
          sub={`${s.ai30.queries.toLocaleString("en-IN")} questions · ${s.ai30.users} users${
            s.ai30.users ? ` · ${formatUsdMicros(Math.round(s.ai30.costMicros / s.ai30.users))} per active user` : ""
          }`}
          href="/admin/ai"
        />
        <StatCard
          label="Open rights requests"
          value={s.rightsOpen}
          sub={s.rightsOverdue ? `${s.rightsOverdue} past the 90-day due date` : "None overdue"}
          href="/admin/rights"
          tone={s.rightsOverdue ? "danger" : s.rightsOpen ? "warning" : "default"}
        />
        <StatCard label="Payments, last 30 days" value={formatINR(s.revenue30.paise)} sub={`${s.revenue30.payments} confirmed by webhook`} />
        <StatCard label="E-sign envelopes" value={totalEnvelopes.toLocaleString("en-IN")} sub="All statuses" />
        <StatCard
          label="Database security"
          value={dbReport.ok ? "Protected" : `${dbReport.findings.length} issue${dbReport.findings.length === 1 ? "" : "s"}`}
          sub={dbReport.ok ? `All ${dbReport.checks} checks passed (RLS, triggers, privileges)` : dbReport.findings.slice(0, 2).join("; ")}
          tone={dbReport.ok ? "default" : "danger"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="env-heading" className="space-y-3">
          <h2 id="env-heading" className="text-base font-semibold text-ink">
            Envelopes by status
          </h2>
          {s.envelopes.length === 0 ? (
            <Card className="p-5 text-sm text-muted">No envelopes yet.</Card>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Status</Th>
                  <Th className="text-right">Envelopes</Th>
                </tr>
              </thead>
              <tbody>
                {s.envelopes.map((e) => (
                  <tr key={e.status}>
                    <Td className="capitalize">{e.status.replaceAll("_", " ").toLowerCase()}</Td>
                    <Td className="text-right tabular-nums">{e.n.toLocaleString("en-IN")}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <section aria-labelledby="int-heading" className="space-y-3">
          <h2 id="int-heading" className="text-base font-semibold text-ink">
            Integrations
          </h2>
          <Card>
            <ul className="divide-y divide-border">
              {integrations.map((i) => {
                const on = i.on();
                return (
                  <li key={i.key} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-ink">{i.label}</span>
                    <span className={on ? "inline-flex items-center gap-1.5 text-success" : "inline-flex items-center gap-1.5 text-muted"}>
                      {on ? <CheckCircle2 className="size-4" aria-hidden /> : <CircleSlash className="size-4" aria-hidden />}
                      {on ? "Configured" : "Not configured"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      </div>
    </div>
  );
}
