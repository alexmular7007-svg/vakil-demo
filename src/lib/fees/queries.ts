import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import { withUser, type Tx } from "@/lib/db";
import { advocateProfiles, clients, feeReceipts, invoices, matters, practiceProfiles } from "@/lib/db/schema";
import type { Notice } from "@/lib/notifications";
import { formatDate, formatINR } from "@/lib/utils";
import { financialYearOf, istToday } from "./fy";
import { balanceOf, daysOverdue, isOverdue } from "./status";

export type BillTo = { name: string; address?: string; gstin?: string; email?: string };
export type LineItem = { description: string; amountPaise: number };

export type InvoiceRow = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string | null;
  billToName: string;
  clientId: string | null;
  matterId: string | null;
  totalPaise: number;
  paidPaise: number;
  status: string;
};

export type ReceiptRow = {
  id: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  clientId: string | null;
  payerName: string | null;
  amountPaise: number;
  receivedOn: string;
  mode: string;
  reference: string | null;
};

export type BillingProfile = {
  saved: boolean;
  displayName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  upiId: string | null;
  invoicePrefix: string;
};

/**
 * Sum of receipts recorded against each invoice of the outer `from invoices` query.
 * Written with explicit qualifiers: Drizzle prints select-list columns unqualified
 * ("id"), which inside a correlated subquery would bind to the inner table.
 */
export function paidSql() {
  return sql<number>`coalesce((select sum(r.amount_paise) from ${feeReceipts} r where r.invoice_id = "invoices"."id"), 0)`.mapWith(Number);
}

const OPEN = ["issued", "partly_paid"];
const BILLED = ["issued", "partly_paid", "paid"];

/**
 * Letterhead and billing details. Falls back to the advocate profile name, then
 * the account name, so a memo always carries the practitioner's name.
 */
export async function getBillingProfile(userId: string, accountName: string): Promise<BillingProfile> {
  return withUser(userId, async (tx) => {
    const [[p], [adv]] = await Promise.all([
      tx.select().from(practiceProfiles).where(eq(practiceProfiles.ownerId, userId)).limit(1),
      tx.select({ displayName: advocateProfiles.displayName }).from(advocateProfiles).where(eq(advocateProfiles.userId, userId)).limit(1),
    ]);
    return {
      saved: Boolean(p),
      displayName: p?.displayName || adv?.displayName || accountName,
      address: p?.address ?? null,
      phone: p?.phone ?? null,
      email: p?.email ?? null,
      gstin: p?.gstin ?? null,
      upiId: p?.upiId ?? null,
      invoicePrefix: p?.invoicePrefix || "INV",
    };
  });
}

export async function listInvoices(userId: string, filter?: { clientId?: string; matterId?: string }): Promise<InvoiceRow[]> {
  const where: SQL[] = [eq(invoices.ownerId, userId)];
  if (filter?.clientId) where.push(eq(invoices.clientId, filter.clientId));
  if (filter?.matterId) where.push(eq(invoices.matterId, filter.matterId));
  const rows = await withUser(userId, (tx) =>
    tx
      .select({
        id: invoices.id,
        number: invoices.number,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        billTo: invoices.billTo,
        clientId: invoices.clientId,
        matterId: invoices.matterId,
        totalPaise: invoices.totalPaise,
        paidPaise: paidSql(),
        status: invoices.status,
      })
      .from(invoices)
      .where(and(...where))
      .orderBy(desc(invoices.issueDate), desc(invoices.number))
      .limit(500),
  );
  return rows.map(({ billTo, ...r }) => ({ ...r, billToName: billTo?.name ?? "" }));
}

export async function listReceipts(userId: string, filter?: { clientId?: string; invoiceId?: string }): Promise<ReceiptRow[]> {
  const where: SQL[] = [eq(feeReceipts.ownerId, userId)];
  if (filter?.clientId) where.push(eq(feeReceipts.clientId, filter.clientId));
  if (filter?.invoiceId) where.push(eq(feeReceipts.invoiceId, filter.invoiceId));
  const rows = await withUser(userId, (tx) =>
    tx
      .select({
        id: feeReceipts.id,
        invoiceId: feeReceipts.invoiceId,
        invoiceNumber: invoices.number,
        billTo: invoices.billTo,
        clientId: feeReceipts.clientId,
        clientName: clients.name,
        amountPaise: feeReceipts.amountPaise,
        receivedOn: feeReceipts.receivedOn,
        mode: feeReceipts.mode,
        reference: feeReceipts.reference,
      })
      .from(feeReceipts)
      .leftJoin(invoices, eq(invoices.id, feeReceipts.invoiceId))
      .leftJoin(clients, eq(clients.id, feeReceipts.clientId))
      .where(and(...where))
      .orderBy(desc(feeReceipts.receivedOn), desc(feeReceipts.createdAt))
      .limit(500),
  );
  return rows.map(({ billTo, clientName, ...r }) => ({ ...r, payerName: clientName ?? billTo?.name ?? null }));
}

export async function loadInvoice(userId: string, id: string) {
  return withUser(userId, async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!invoice) return null;
    const [receipts, [matter], [client]] = await Promise.all([
      tx
        .select({
          id: feeReceipts.id,
          amountPaise: feeReceipts.amountPaise,
          receivedOn: feeReceipts.receivedOn,
          mode: feeReceipts.mode,
          reference: feeReceipts.reference,
        })
        .from(feeReceipts)
        .where(eq(feeReceipts.invoiceId, id))
        .orderBy(asc(feeReceipts.receivedOn), asc(feeReceipts.createdAt)),
      invoice.matterId
        ? tx
            .select({ id: matters.id, title: matters.title, court: matters.court, caseNo: matters.caseNo, cnr: matters.cnr })
            .from(matters)
            .where(eq(matters.id, invoice.matterId))
            .limit(1)
        : Promise.resolve([]),
      invoice.clientId
        ? tx.select({ id: clients.id, name: clients.name, kind: clients.kind }).from(clients).where(eq(clients.id, invoice.clientId)).limit(1)
        : Promise.resolve([]),
    ]);
    const paidPaise = receipts.reduce((a, r) => a + r.amountPaise, 0);
    return { invoice, receipts, paidPaise, matter: matter ?? null, client: client ?? null };
  });
}

export type FeeSummary = { billedPaise: number; receivedPaise: number; outstandingPaise: number; overdueCount: number };

/**
 * Fee book totals for the current Indian financial year (April to March, IST):
 * billed = invoices issued this year (not cancelled), received = receipts dated
 * this year. Outstanding and overdue are as of today across all open invoices,
 * because dues from last year are still owed.
 */
export async function getFeeSummary(
  userId: string,
  txOpt?: Tx,
): Promise<{ billedPaise: number; receivedPaise: number; outstandingPaise: number; overdueCount: number }> {
  const today = istToday();
  const fy = financialYearOf(today);
  const run = async (tx: Tx) => {
    const [[billed], [received], open] = await Promise.all([
      tx
        .select({ v: sql<number>`coalesce(sum(${invoices.totalPaise}), 0)`.mapWith(Number) })
        .from(invoices)
        .where(and(eq(invoices.ownerId, userId), inArray(invoices.status, BILLED), gte(invoices.issueDate, fy.start), lte(invoices.issueDate, fy.end))),
      tx
        .select({ v: sql<number>`coalesce(sum(${feeReceipts.amountPaise}), 0)`.mapWith(Number) })
        .from(feeReceipts)
        .where(and(eq(feeReceipts.ownerId, userId), gte(feeReceipts.receivedOn, fy.start), lte(feeReceipts.receivedOn, fy.end))),
      tx
        .select({ status: invoices.status, totalPaise: invoices.totalPaise, paidPaise: paidSql(), dueDate: invoices.dueDate })
        .from(invoices)
        .where(and(eq(invoices.ownerId, userId), inArray(invoices.status, OPEN))),
    ]);
    let outstandingPaise = 0;
    let overdueCount = 0;
    for (const inv of open) {
      outstandingPaise += balanceOf(inv);
      if (isOverdue(inv, today)) overdueCount++;
    }
    return { billedPaise: billed?.v ?? 0, receivedPaise: received?.v ?? 0, outstandingPaise, overdueCount };
  };
  return txOpt ? run(txOpt) : withUser(userId, run);
}

/** Overdue, unpaid invoices for the notifications bell (oldest due first, at most 5). */
export async function invoiceNotices(userId: string, txOpt?: Tx): Promise<Notice[]> {
  const today = istToday();
  const run = async (tx: Tx) => {
    const rows = await tx
      .select({
        id: invoices.id,
        number: invoices.number,
        billTo: invoices.billTo,
        status: invoices.status,
        totalPaise: invoices.totalPaise,
        paidPaise: paidSql(),
        dueDate: invoices.dueDate,
        updatedAt: invoices.updatedAt,
      })
      .from(invoices)
      .where(and(eq(invoices.ownerId, userId), inArray(invoices.status, OPEN), lt(invoices.dueDate, today)))
      .orderBy(asc(invoices.dueDate))
      .limit(20);
    const out: Notice[] = [];
    for (const r of rows) {
      if (!r.dueDate || !isOverdue(r, today)) continue;
      const late = daysOverdue(r.dueDate, today);
      out.push({
        id: `inv-${r.id}`,
        kind: "invoice",
        title: `Fee overdue: ${r.number}`,
        detail: `${formatINR(balanceOf(r))} from ${r.billTo?.name ?? "client"} · due ${formatDate(r.dueDate)} (${late} ${late === 1 ? "day" : "days"} late)`,
        href: `/app/fees/${r.id}`,
        at: new Date(`${r.dueDate}T00:00:00+05:30`).toISOString(),
        urgent: late > 30,
      });
      if (out.length === 5) break;
    }
    return out;
  };
  return txOpt ? run(txOpt) : withUser(userId, run);
}
