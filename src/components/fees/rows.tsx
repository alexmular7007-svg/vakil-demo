// Bank-transaction style rows for invoices and receipts. No hooks, so these
// render in both server pages and client components.
import Link from "next/link";
import { Banknote, ChevronRight, FileCheck, Landmark, ReceiptIndianRupee, Smartphone, Wallet } from "lucide-react";
import { Badge, IconTile } from "@/components/ui/display";
import { RECEIPT_MODE_LABELS, STATUS_META, displayStatus, type InvoiceDisplayStatus, type ReceiptMode } from "@/lib/fees/status";
import { cn, formatDate, formatINR } from "@/lib/utils";

export type InvoiceListItem = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string | null;
  billToName: string;
  totalPaise: number;
  paidPaise: number;
  status: string;
};

export type ReceiptListItem = {
  id: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  payerName: string | null;
  amountPaise: number;
  receivedOn: string;
  mode: string;
  reference: string | null;
};

export function InvoiceStatusBadge({ status, className }: { status: InvoiceDisplayStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} dot className={className}>
      {m.label}
    </Badge>
  );
}

const shortDate = { day: "numeric", month: "short", year: "numeric" } as const;

export function InvoiceRow({ row, today }: { row: InvoiceListItem; today: string }) {
  const status = displayStatus(row, today);
  const cancelled = status === "cancelled";
  return (
    <Link href={`/app/fees/${row.id}`} className="group flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:px-5">
      <IconTile icon={ReceiptIndianRupee} tone={cancelled ? "slate" : status === "paid" ? "green" : status === "overdue" ? "maroon" : "gold"} size="sm" />
      <div className="min-w-0 flex-1">
        <p data-private className={cn("truncate font-semibold text-ink group-hover:text-primary", cancelled && "text-muted")}>
          {row.billToName || "Unnamed client"}
        </p>
        <p className="truncate text-[13px] text-muted tabular">
          {row.number} · {formatDate(row.issueDate, shortDate)}
          {row.dueDate && (status === "issued" || status === "partly_paid" || status === "overdue") ? ` · due ${formatDate(row.dueDate, shortDate)}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn("text-[15px] font-semibold text-ink tabular", cancelled && "text-muted line-through")}>{formatINR(row.totalPaise)}</span>
        <InvoiceStatusBadge status={status} />
      </div>
      <ChevronRight className="hidden size-4 shrink-0 text-muted sm:block" aria-hidden />
    </Link>
  );
}

const modeIcons: Record<ReceiptMode, React.ComponentType<{ className?: string }>> = {
  upi: Smartphone,
  bank: Landmark,
  cash: Banknote,
  cheque: FileCheck,
  other: Wallet,
};

export function receiptModeLabel(mode: string) {
  return RECEIPT_MODE_LABELS[mode as ReceiptMode] ?? "Other";
}

export function ReceiptRow({ row }: { row: ReceiptListItem }) {
  const Icon = modeIcons[row.mode as ReceiptMode] ?? Wallet;
  const body = (
    <>
      <IconTile icon={Icon} tone="green" size="sm" />
      <div className="min-w-0 flex-1">
        <p data-private className="truncate font-semibold text-ink group-hover:text-primary">
          {row.payerName || "Fee received"}
        </p>
        <p className="truncate text-[13px] text-muted tabular">
          {formatDate(row.receivedOn, shortDate)} · {receiptModeLabel(row.mode)}
          {row.invoiceNumber ? ` · ${row.invoiceNumber}` : ""}
          {row.reference ? ` · Ref ${row.reference}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-[15px] font-semibold text-success tabular">+{formatINR(row.amountPaise)}</span>
    </>
  );
  const cls = "group flex min-h-16 items-center gap-3 px-4 py-3 transition-colors sm:px-5";
  return row.invoiceId ? (
    <Link href={`/app/fees/${row.invoiceId}`} className={cn(cls, "hover:bg-surface-2/60")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
