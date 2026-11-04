import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Info, Plus, ReceiptIndianRupee, Settings2 } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getBillingProfile, getFeeSummary, listInvoices, listReceipts } from "@/lib/fees/queries";
import { financialYearOf, istToday } from "@/lib/fees/fy";
import { Alert, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { FeeBookTabs } from "@/components/fees/fee-book-tabs";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Fee book" };

export default async function FeeBookPage() {
  const user = await requireUser("/app/fees");
  await connection();
  const today = istToday();
  const fy = financialYearOf(today);
  const [summary, invoices, receipts, profile] = await Promise.all([
    getFeeSummary(user.id),
    listInvoices(user.id),
    listReceipts(user.id),
    getBillingProfile(user.id, user.name),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Practice"
        icon={ReceiptIndianRupee}
        title="Fee book"
        description="Professional fee memos, receipts and dues, with a UPI QR code on every memo."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/app/fees/settings">
                <Settings2 /> Billing profile
              </Link>
            </Button>
            <Button asChild>
              <Link href="/app/fees/new">
                <Plus /> New fee memo
              </Link>
            </Button>
          </>
        }
      />

      {!profile.saved ? (
        <Alert
          tone="info"
          title="Set up your letterhead"
          className="mb-6"
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/app/fees/settings">Set up</Link>
            </Button>
          }
        >
          Add your chamber address, UPI ID and invoice prefix so memos print with your details and a Pay by UPI code.
        </Alert>
      ) : null}

      <section aria-label={`Fee summary for ${fy.label}`} className="brand-surface mb-6 rounded-lg p-5 shadow-brand sm:p-6">
        <p className="text-[11px] font-bold tracking-[0.16em] text-gold-bright uppercase">Financial year {fy.label}</p>
        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <p className="font-serif text-4xl font-semibold tracking-tight text-on-brand tabular sm:text-[44px]">{formatINR(summary.billedPaise)}</p>
          <p className="text-sm text-on-brand-muted">billed since 1 April</p>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-on-brand/15 pt-4">
          <SummaryStat label="Received" value={formatINR(summary.receivedPaise)} />
          <SummaryStat label="Outstanding" value={formatINR(summary.outstandingPaise)} />
          <SummaryStat label="Overdue" value={String(summary.overdueCount)} hint={summary.overdueCount === 1 ? "memo" : "memos"} alert={summary.overdueCount > 0} />
        </dl>
      </section>

      <FeeBookTabs invoices={invoices} receipts={receipts} today={today} />

      <p className="mt-6 flex gap-2 text-xs text-muted">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Receipts here are professional fees. Keep client money (court fees, deposits, amounts held for a client) in a separate account and out of
          this book, as BCI Rule 25 requires. Fees cannot depend on the result of a case (BCI Rule 20).
        </span>
      </p>
    </>
  );
}

function SummaryStat({ label, value, hint, alert }: { label: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-wide text-on-brand-muted uppercase">{label}</dt>
      <dd className={alert ? "mt-0.5 truncate text-base font-semibold text-gold-bright tabular sm:text-lg" : "mt-0.5 truncate text-base font-semibold text-on-brand tabular sm:text-lg"}>
        {value}
        {hint ? <span className="ml-1 text-xs font-normal text-on-brand-muted">{hint}</span> : null}
      </dd>
    </div>
  );
}
