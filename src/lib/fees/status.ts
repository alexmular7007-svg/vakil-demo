// Invoice status and balances. Pure, safe for client and server.

import { daysBetween } from "./fy";

/** Stored statuses (invoices.status). "overdue" is derived, never stored. */
export type StoredInvoiceStatus = "draft" | "issued" | "partly_paid" | "paid" | "cancelled";
export type InvoiceDisplayStatus = StoredInvoiceStatus | "overdue";

export type BadgeTone = "info" | "warning" | "success" | "danger" | "neutral";

export const STATUS_META: Record<InvoiceDisplayStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  issued: { label: "Issued", tone: "info" },
  partly_paid: { label: "Partly paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  overdue: { label: "Overdue", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const RECEIPT_MODES = ["upi", "bank", "cash", "cheque"] as const;
export type ReceiptMode = (typeof RECEIPT_MODES)[number] | "other";

export const RECEIPT_MODE_LABELS: Record<ReceiptMode, string> = {
  upi: "UPI",
  bank: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

type InvoiceLike = { status: string; totalPaise: number; paidPaise: number; dueDate: string | null };

/** Whether the invoice still expects money. */
export function isOpen(status: string): boolean {
  return status === "issued" || status === "partly_paid";
}

/** What the client still owes on this invoice (zero once paid or cancelled). */
export function balanceOf(inv: Pick<InvoiceLike, "status" | "totalPaise" | "paidPaise">): number {
  if (!isOpen(inv.status)) return 0;
  return Math.max(0, inv.totalPaise - inv.paidPaise);
}

/** Open, not fully paid, and the due date has passed (today is not overdue). */
export function isOverdue(inv: InvoiceLike, today: string): boolean {
  return isOpen(inv.status) && balanceOf(inv) > 0 && inv.dueDate !== null && inv.dueDate < today;
}

export function displayStatus(inv: InvoiceLike, today: string): InvoiceDisplayStatus {
  if (isOverdue(inv, today)) return "overdue";
  const s = inv.status as StoredInvoiceStatus;
  return s in STATUS_META ? s : "issued";
}

export function daysOverdue(dueDate: string, today: string): number {
  return Math.max(0, daysBetween(dueDate, today));
}

/** Stored status after a payment change: paid when the total is covered. */
export function statusAfterPayments(totalPaise: number, paidPaise: number): "issued" | "partly_paid" | "paid" {
  if (paidPaise <= 0) return "issued";
  return paidPaise >= totalPaise ? "paid" : "partly_paid";
}
