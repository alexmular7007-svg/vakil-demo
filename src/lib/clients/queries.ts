import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { clients, invoices, matters } from "@/lib/db/schema";
import { istToday } from "@/lib/fees/fy";
import { paidSql } from "@/lib/fees/queries";
import { balanceOf, isOverdue } from "@/lib/fees/status";
import { escapeLike } from "./identifiers";

export type ClientOption = { id: string; name: string; kind: string };

export type ClientListRow = {
  id: string;
  name: string;
  kind: string;
  phone: string | null;
  email: string | null;
  matterCount: number;
  outstandingPaise: number;
  overdue: boolean;
};

export async function listClientOptions(userId: string): Promise<ClientOption[]> {
  return withUser(userId, (tx) =>
    tx.select({ id: clients.id, name: clients.name, kind: clients.kind }).from(clients).where(eq(clients.ownerId, userId)).orderBy(asc(clients.name)).limit(2000),
  );
}

/** Every client with their matter count and what they owe today. */
export async function listClients(userId: string): Promise<ClientListRow[]> {
  const today = istToday();
  return withUser(userId, async (tx) => {
    const [rows, matterCounts, open] = await Promise.all([
      tx
        .select({ id: clients.id, name: clients.name, kind: clients.kind, phone: clients.phone, email: clients.email })
        .from(clients)
        .where(eq(clients.ownerId, userId))
        .orderBy(asc(clients.name))
        .limit(2000),
      tx
        .select({ clientId: matters.clientId, n: sql<number>`count(*)::int` })
        .from(matters)
        .where(and(eq(matters.ownerId, userId), sql`${matters.clientId} is not null`))
        .groupBy(matters.clientId),
      tx
        .select({
          clientId: invoices.clientId,
          status: invoices.status,
          totalPaise: invoices.totalPaise,
          dueDate: invoices.dueDate,
          paidPaise: paidSql(),
        })
        .from(invoices)
        .where(and(eq(invoices.ownerId, userId), inArray(invoices.status, ["issued", "partly_paid"]), sql`${invoices.clientId} is not null`)),
    ]);
    const counts = new Map(matterCounts.map((m) => [m.clientId, m.n]));
    const dues = new Map<string, { paise: number; overdue: boolean }>();
    for (const inv of open) {
      if (!inv.clientId) continue;
      const d = dues.get(inv.clientId) ?? { paise: 0, overdue: false };
      d.paise += balanceOf(inv);
      d.overdue ||= isOverdue(inv, today);
      dues.set(inv.clientId, d);
    }
    return rows.map((r) => ({
      ...r,
      matterCount: counts.get(r.id) ?? 0,
      outstandingPaise: dues.get(r.id)?.paise ?? 0,
      overdue: dues.get(r.id)?.overdue ?? false,
    }));
  });
}

export async function loadClient(userId: string, id: string) {
  return withUser(userId, async (tx) => {
    const [client] = await tx.select().from(clients).where(eq(clients.id, id)).limit(1);
    if (!client) return null;
    const clientMatters = await tx
      .select({ id: matters.id, title: matters.title, court: matters.court, caseNo: matters.caseNo, status: matters.status, updatedAt: matters.updatedAt })
      .from(matters)
      .where(eq(matters.clientId, id))
      .orderBy(sql`${matters.status} = 'closed'`, desc(matters.updatedAt))
      .limit(200);
    return { client, matters: clientMatters };
  });
}

export type ConflictHit = {
  key: string;
  /** client = one of your clients; opposing = opposing party in a matter; matter_client / title = named in a matter */
  role: "client" | "opposing" | "matter_client" | "title";
  name: string;
  context: string;
  href: string;
  closed?: boolean;
};

/**
 * Where a name already appears in the user's practice: client names, and each
 * matter's client name, opposing party and title (case-insensitive substring).
 */
export async function findConflicts(userId: string, query: string): Promise<ConflictHit[]> {
  const q = query.trim();
  const pattern = `%${escapeLike(q)}%`;
  const lower = q.toLowerCase();
  const { clientRows, matterRows } = await withUser(userId, async (tx) => {
    const [clientRows, matterRows] = await Promise.all([
      tx
        .select({ id: clients.id, name: clients.name, kind: clients.kind })
        .from(clients)
        .where(and(eq(clients.ownerId, userId), ilike(clients.name, pattern)))
        .orderBy(asc(clients.name))
        .limit(25),
      tx
        .select({ id: matters.id, title: matters.title, clientName: matters.clientName, opposingParty: matters.opposingParty, status: matters.status })
        .from(matters)
        .where(and(eq(matters.ownerId, userId), or(ilike(matters.opposingParty, pattern), ilike(matters.clientName, pattern), ilike(matters.title, pattern))))
        .orderBy(desc(matters.updatedAt))
        .limit(40),
    ]);
    return { clientRows, matterRows };
  });

  const hits: ConflictHit[] = clientRows.map((c) => ({
    key: `c-${c.id}`,
    role: "client",
    name: c.name,
    context: c.kind === "business" ? "Your client (business)" : "Your client",
    href: `/app/clients/${c.id}`,
  }));
  for (const m of matterRows) {
    const closed = m.status === "closed";
    const base = { href: `/app/matters/${m.id}`, closed };
    if (m.opposingParty?.toLowerCase().includes(lower)) {
      hits.push({ ...base, key: `o-${m.id}`, role: "opposing", name: m.opposingParty, context: `Opposing party in ${m.title}` });
    }
    if (m.clientName?.toLowerCase().includes(lower)) {
      hits.push({ ...base, key: `m-${m.id}`, role: "matter_client", name: m.clientName, context: `Client in ${m.title}` });
    }
    if (m.title.toLowerCase().includes(lower) && !m.opposingParty?.toLowerCase().includes(lower) && !m.clientName?.toLowerCase().includes(lower)) {
      hits.push({ ...base, key: `t-${m.id}`, role: "title", name: m.title, context: "Named in the matter title" });
    }
  }
  return hits;
}
