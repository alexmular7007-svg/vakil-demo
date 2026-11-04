import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, ilike, inArray } from "drizzle-orm";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { auditEvents, user as userTable } from "@/lib/db/schema";
import { PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { VerifyChainButton } from "@/components/admin/verify-chain-button";
import { formatDateTime, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE = 50;

function one(v: string | string[] | undefined, max = 80) {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim().slice(0, max);
}

export default async function AdminAuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const action = one(sp.action).replace(/[^a-z0-9._-]/gi, "");
  const page = Math.max(1, Number.parseInt(one(sp.page, 6), 10) || 1);
  const where = action ? ilike(auditEvents.action, `%${action}%`) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(auditEvents)
      .where(where)
      .orderBy(desc(auditEvents.seq))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ n: count() }).from(auditEvents).where(where),
  ]);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((v): v is string => Boolean(v)))];
  const actors = actorIds.length
    ? await db.select({ id: userTable.id, email: userTable.email }).from(userTable).where(inArray(userTable.id, actorIds))
    : [];
  const actorEmail = new Map(actors.map((a) => [a.id, a.email]));
  const totalN = Number(total?.n ?? 0);
  const pages = Math.max(1, Math.ceil(totalN / PAGE));
  const link = (p: number) => `/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), page: String(p) }).toString()}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Append-only, hash-chained record of security and legal events. Each row's hash covers the previous row, so any edit, deletion or reordering breaks the chain."
      />

      <VerifyChainButton />

      <form method="get" role="search" aria-label="Filter audit events" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="action" className="sr-only">
          Action contains
        </label>
        <Input id="action" name="action" defaultValue={action} placeholder="Action contains, e.g. advocate. or billing." className="sm:max-w-sm" />
        <Button type="submit" variant="outline">
          <Search /> Filter
        </Button>
      </form>

      <Table>
        <thead>
          <tr>
            <Th className="w-16">#</Th>
            <Th>When</Th>
            <Th>Action</Th>
            <Th className="hidden md:table-cell">Actor</Th>
            <Th className="hidden lg:table-cell">Entity</Th>
            <Th className="hidden xl:table-cell">Data</Th>
            <Th className="hidden xl:table-cell">Hash</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <Td colSpan={7} className="py-10 text-center text-muted">
                No events.
              </Td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.seq}>
                <Td className="font-mono text-xs tabular-nums">{r.seq}</Td>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(r.at)}</Td>
                <Td>
                  <span className="font-mono text-xs text-ink">{r.action}</span>
                  <span className="block text-xs text-muted md:hidden">
                    {r.actorId ? (actorEmail.get(r.actorId) ?? r.actorId) : (r.actorRole ?? "system")}
                  </span>
                </Td>
                <Td className="hidden max-w-[14rem] md:table-cell">
                  <span className="block truncate text-xs">{r.actorId ? (actorEmail.get(r.actorId) ?? r.actorId) : "—"}</span>
                  <span className="text-xs text-muted">
                    {r.actorRole ?? ""}
                    {r.ip ? ` · ${r.ip}` : ""}
                  </span>
                </Td>
                <Td className="hidden max-w-[12rem] lg:table-cell">
                  <span className="block truncate text-xs">{r.entityType ? `${r.entityType}${r.entityId ? `:${r.entityId}` : ""}` : "—"}</span>
                </Td>
                <Td className="hidden max-w-[18rem] xl:table-cell">
                  <code className="block truncate font-mono text-[11px] text-muted" title={r.data ? JSON.stringify(r.data) : undefined}>
                    {r.data ? truncate(JSON.stringify(r.data), 90) : "—"}
                  </code>
                </Td>
                <Td className="hidden xl:table-cell">
                  <code className="font-mono text-[11px] text-muted" title={r.hash}>
                    {r.hash.slice(0, 10)}…
                  </code>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={link(page - 1)}>
                <ChevronLeft /> Newer
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted">
            Page {page} of {pages.toLocaleString("en-IN")}
          </span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={link(page + 1)}>
                Older <ChevronRight />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
