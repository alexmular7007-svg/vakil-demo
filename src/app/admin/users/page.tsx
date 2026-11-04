import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema";
import { Badge, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { UserActions } from "@/components/admin/user-actions";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Users" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE = 25;

function one(v: string | string[] | undefined, max = 100) {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim().slice(0, max);
}

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdminPage();
  const sp = await searchParams;
  const q = one(sp.q);
  const roleFilter = ["user", "advocate", "admin", "banned"].includes(one(sp.role)) ? one(sp.role) : "";
  const page = Math.max(1, Number.parseInt(one(sp.page, 5), 10) || 1);

  const conds: SQL[] = [];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const c = or(ilike(userTable.name, like), ilike(userTable.email, like), eq(userTable.id, q));
    if (c) conds.push(c);
  }
  if (roleFilter === "banned") conds.push(eq(userTable.banned, true));
  else if (roleFilter) conds.push(eq(userTable.role, roleFilter));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        emailVerified: userTable.emailVerified,
        role: userTable.role,
        banned: userTable.banned,
        banReason: userTable.banReason,
        banExpires: userTable.banExpires,
        twoFactorEnabled: userTable.twoFactorEnabled,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .where(where)
      .orderBy(desc(userTable.createdAt), desc(userTable.id))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ n: count() }).from(userTable).where(where),
  ]);
  const totalN = Number(total?.n ?? 0);
  const pages = Math.max(1, Math.ceil(totalN / PAGE));
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (roleFilter) params.set("role", roleFilter);
    params.set("page", String(p));
    return `/admin/users?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description={`${totalN.toLocaleString("en-IN")} ${totalN === 1 ? "account" : "accounts"}. Role and ban changes are written to the audit log.`} />

      <form method="get" role="search" aria-label="Search users" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="q" className="sr-only">
          Name, email or user id
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder="Name, email or user id" className="sm:max-w-sm" />
        <label htmlFor="role" className="sr-only">
          Filter by role
        </label>
        <Select id="role" name="role" defaultValue={roleFilter} className="sm:w-40">
          <option value="">All roles</option>
          <option value="user">Users</option>
          <option value="advocate">Advocates</option>
          <option value="admin">Admins</option>
          <option value="banned">Banned</option>
        </Select>
        <Button type="submit" variant="outline">
          <Search /> Search
        </Button>
      </form>

      <Table>
        <thead>
          <tr>
            <Th>User</Th>
            <Th className="hidden md:table-cell">Status</Th>
            <Th className="hidden lg:table-cell">Joined</Th>
            <Th>Role and access</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <Td colSpan={4} className="py-10 text-center text-muted">
                No users match.
              </Td>
            </tr>
          ) : (
            rows.map((u) => (
              <tr key={u.id}>
                <Td className="max-w-[16rem]">
                  <p className="truncate font-medium text-ink">{u.name}</p>
                  <p className="truncate text-xs text-muted">{u.email}</p>
                  <div className="mt-1 flex flex-wrap gap-1 md:hidden">
                    {u.banned ? <Badge tone="danger">Banned</Badge> : null}
                    {u.twoFactorEnabled ? <Badge tone="success">2FA</Badge> : null}
                  </div>
                </Td>
                <Td className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {u.banned ? (
                      <Badge tone="danger" title={u.banReason ?? undefined}>
                        Banned{u.banExpires ? ` until ${formatDate(u.banExpires)}` : ""}
                      </Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                    {u.emailVerified ? null : <Badge tone="warning">Email unverified</Badge>}
                    {u.twoFactorEnabled ? (
                      <Badge tone="info">
                        <ShieldCheck /> 2FA
                      </Badge>
                    ) : null}
                  </div>
                  {u.banned && u.banReason ? <p className="mt-1 max-w-56 truncate text-xs text-muted">{u.banReason}</p> : null}
                </Td>
                <Td className="hidden whitespace-nowrap lg:table-cell">{formatDate(u.createdAt)}</Td>
                <Td>
                  <UserActions
                    userId={u.id}
                    name={u.name}
                    role={(u.role === "admin" || u.role === "advocate" ? u.role : "user") as "user" | "advocate" | "admin"}
                    banned={Boolean(u.banned)}
                    isSelf={u.id === admin.id}
                  />
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
                <ChevronLeft /> Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={link(page + 1)}>
                Next <ChevronRight />
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
