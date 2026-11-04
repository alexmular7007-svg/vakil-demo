"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, ReceiptIndianRupee, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/display";
import { Tabs } from "@/components/ui/overlay";
import { displayStatus } from "@/lib/fees/status";
import { cn } from "@/lib/utils";
import { InvoiceRow, ReceiptRow, type InvoiceListItem, type ReceiptListItem } from "./rows";

const filters = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
] as const;
type Filter = (typeof filters)[number]["value"];

function matches(f: Filter, status: ReturnType<typeof displayStatus>) {
  if (f === "all") return true;
  if (f === "unpaid") return status === "issued" || status === "partly_paid" || status === "overdue";
  return status === f;
}

export function FeeBookTabs({ invoices, receipts, today }: { invoices: InvoiceListItem[]; receipts: ReceiptListItem[]; today: string }) {
  const [tab, setTab] = useState<"invoices" | "receipts">("invoices");
  const [filter, setFilter] = useState<Filter>("all");
  const withStatus = invoices.map((row) => ({ row, status: displayStatus(row, today) }));
  const shown = withStatus.filter((r) => matches(filter, r.status));
  const count = (f: Filter) => withStatus.filter((r) => matches(f, r.status)).length;

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onChange={(v) => setTab(v as "invoices" | "receipts")}
        tabs={[
          { value: "invoices", label: <span className="inline-flex min-h-8 items-center gap-1.5">Invoices <span className="text-xs text-muted tabular">{invoices.length}</span></span> },
          { value: "receipts", label: <span className="inline-flex min-h-8 items-center gap-1.5">Receipts <span className="text-xs text-muted tabular">{receipts.length}</span></span> },
        ]}
      />

      {tab === "invoices" ? (
        invoices.length === 0 ? (
          <EmptyState
            icon={ReceiptIndianRupee}
            title="No fee memos yet"
            description="Raise a professional fee memo with a UPI QR code, then record receipts as the client pays."
            action={
              <Button asChild>
                <Link href="/app/fees/new">
                  <Plus /> New fee memo
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            <div role="group" aria-label="Filter invoices" className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
              {filters.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "pressable inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold sm:min-h-9",
                    filter === f.value ? "border-primary bg-primary text-primary-ink" : "border-border bg-surface text-ink-2 hover:bg-surface-2",
                  )}
                >
                  {f.label}
                  <span className={cn("text-xs tabular", filter === f.value ? "text-primary-ink/80" : "text-muted")}>{count(f.value)}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">Nothing here.</p>
            ) : (
              <Card>
                <ul className="divide-y divide-border">
                  {shown.map(({ row }) => (
                    <li key={row.id}>
                      <InvoiceRow row={row} today={today} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )
      ) : receipts.length === 0 ? (
        <EmptyState icon={Wallet} title="No receipts yet" description="Open a fee memo and choose Record receipt when the client pays." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {receipts.map((r) => (
              <li key={r.id}>
                <ReceiptRow row={r} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
