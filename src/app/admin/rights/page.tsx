import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { Scale } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { rightsRequests, user as userTable } from "@/lib/db/schema";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { RightsRespondForm } from "@/components/admin/rights-respond-form";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Rights requests" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const tabs = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
] as const;
const statusTone = { open: "warning", in_progress: "info", resolved: "success", rejected: "danger" } as const;
const statusLabel = { open: "Open", in_progress: "In progress", resolved: "Resolved", rejected: "Declined" } as const;

export default async function AdminRightsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) === "closed" ? "closed" : "open";
  const statuses = tab === "open" ? ["open", "in_progress"] : ["resolved", "rejected"];

  const [rows, counts] = await Promise.all([
    db
      .select({
        id: rightsRequests.id,
        type: rightsRequests.type,
        details: rightsRequests.details,
        status: rightsRequests.status,
        response: rightsRequests.response,
        dueAt: rightsRequests.dueAt,
        createdAt: rightsRequests.createdAt,
        resolvedAt: rightsRequests.resolvedAt,
        userId: rightsRequests.userId,
        email: userTable.email,
        name: userTable.name,
      })
      .from(rightsRequests)
      .innerJoin(userTable, eq(userTable.id, rightsRequests.userId))
      .where(inArray(rightsRequests.status, statuses))
      .orderBy(tab === "open" ? asc(rightsRequests.dueAt) : desc(rightsRequests.resolvedAt))
      .limit(100),
    db.select({ status: rightsRequests.status, n: count() }).from(rightsRequests).groupBy(rightsRequests.status),
  ]);
  const c = Object.fromEntries(counts.map((r) => [r.status, Number(r.n)]));
  const tabCount = { open: (c.open ?? 0) + (c.in_progress ?? 0), closed: (c.resolved ?? 0) + (c.rejected ?? 0) };
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rights requests"
        description="Data-principal requests under the DPDP Act. Respond within 90 days; erasure must also be carried out in the database before you mark it resolved."
      />

      <nav aria-label="Request status" className="flex gap-1 rounded-lg bg-surface-2 p-1 sm:w-fit">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={`/admin/rights?tab=${t.value}`}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium sm:flex-none",
              tab === t.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {t.label} <span className="rounded-full bg-surface-2 px-1.5 text-xs tabular-nums">{tabCount[t.value]}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={Scale} title={tab === "open" ? "No open requests" : "No closed requests yet"} />
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const overdue = tab === "open" && r.dueAt < now;
            return (
              <li key={r.id} className={cn("rounded-lg border bg-surface p-4 shadow-sm sm:p-5", overdue ? "border-danger/50" : "border-border")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-ink capitalize">
                      {r.type.replaceAll("_", " ")} <span className="font-mono text-xs font-normal text-muted normal-case">ref {r.id.slice(0, 8).toUpperCase()}</span>
                    </h2>
                    <p className="truncate text-sm text-muted">
                      {r.name} · {r.email}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={statusTone[r.status as keyof typeof statusTone] ?? "neutral"}>
                      {statusLabel[r.status as keyof typeof statusLabel] ?? r.status}
                    </Badge>
                    {overdue ? <Badge tone="danger">Overdue</Badge> : null}
                  </div>
                </div>
                <p className="mt-3 text-sm whitespace-pre-line text-ink-2">{r.details || "No details given."}</p>
                <p className="mt-2 text-xs text-muted">
                  Filed {formatDateTime(r.createdAt)} · due {formatDate(r.dueAt)}
                  {r.resolvedAt ? ` · closed ${formatDate(r.resolvedAt)}` : ""}
                </p>
                {tab === "open" ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <RightsRespondForm id={r.id} currentResponse={r.response} />
                  </div>
                ) : r.response ? (
                  <div className="mt-3 rounded-md bg-surface-2 p-3 text-sm text-ink-2">
                    <p className="text-xs font-medium text-muted">Response</p>
                    <p className="mt-1 whitespace-pre-line">{r.response}</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
