import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { ArrowLeft, ChevronRight, Contact, Smartphone } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getBillingProfile, loadInvoice } from "@/lib/fees/queries";
import { istToday } from "@/lib/fees/fy";
import { balanceOf, displayStatus, isOpen } from "@/lib/fees/status";
import { buildUpiLink, isValidVpa } from "@/lib/fees/upi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { FeeMemo } from "@/components/fees/fee-memo";
import { InvoiceStatusBadge, receiptModeLabel } from "@/components/fees/rows";
import { CancelInvoiceButton, CopyUpiLinkButton, PrintMemoButton, RecordReceiptButton, RemoveReceiptButton } from "@/components/fees/invoice-actions";
import { formatDate, formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Fee memo" };

// Print: hide the app shell and the side panel, print the memo on white A4.
const printCss = `
@page { size: A4; margin: 1.6cm 1.8cm; }
@media print {
  aside, header, nav, .no-print, [data-sonner-toaster] { display: none !important; }
  html, body { background: #fff !important; }
  div:has(> #main) { padding: 0 !important; }
  #main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  .memo-layout { display: block !important; }
  .fee-memo { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; margin: 0 !important;
    max-width: none !important; background: #fff !important; }
  .fee-memo, .fee-memo * { color: #000 !important; border-color: #c8c8c8 !important; }
  .fee-memo .memo-rule { border-color: #000 !important; }
  .fee-memo tr { break-inside: avoid; }
  .memo-upi { break-inside: avoid; }
}
`;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/app/fees/${id}`);
  await connection();
  const [bundle, profile] = await Promise.all([loadInvoice(user.id, id), getBillingProfile(user.id, user.name)]);
  if (!bundle) notFound();
  const { invoice, receipts, paidPaise, matter, client } = bundle;
  const today = istToday();
  const inv = { status: invoice.status, totalPaise: invoice.totalPaise, paidPaise, dueDate: invoice.dueDate };
  const status = displayStatus(inv, today);
  const balance = balanceOf(inv);

  let upi: { link: string; qr: string; vpa: string; amountPaise: number } | null = null;
  if (profile.upiId && isValidVpa(profile.upiId) && balance > 0) {
    const link = buildUpiLink({ vpa: profile.upiId, name: profile.displayName, amountPaise: balance, note: invoice.number });
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 360, errorCorrectionLevel: "M" });
    upi = { link, qr, vpa: profile.upiId, amountPaise: balance };
  }

  return (
    <>
      <style>{printCss}</style>
      <div className="no-print">
        <Link href="/app/fees" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Fee book
        </Link>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-accent uppercase">Fee memo</p>
            <h1 className="font-serif text-[26px] leading-tight font-semibold tracking-tight text-ink tabular sm:text-[32px]">{invoice.number}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <InvoiceStatusBadge status={status} />
              <span className="tabular">
                {formatINR(invoice.totalPaise)} · issued {formatDate(invoice.issueDate)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isOpen(invoice.status) && balance > 0 ? <RecordReceiptButton invoiceId={invoice.id} balancePaise={balance} today={today} /> : null}
            <PrintMemoButton />
            {invoice.status !== "cancelled" && receipts.length === 0 ? <CancelInvoiceButton invoiceId={invoice.id} number={invoice.number} /> : null}
          </div>
        </div>
      </div>

      <div className="memo-layout grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <FeeMemo
            memo={{ ...invoice, billTo: invoice.billTo, items: invoice.items }}
            letterhead={profile}
            matter={matter}
            paidPaise={paidPaise}
            upi={upi ? { qr: upi.qr, vpa: upi.vpa, amountPaise: upi.amountPaise } : null}
          />
          <p className="no-print mt-3 text-[13px] text-muted">
            In the print dialog choose <strong className="text-ink">Save as PDF</strong>, A4 paper, and turn off headers and footers.
          </p>
        </div>

        <div className="no-print space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <dl className="space-y-1.5 tabular">
                <PayRow label="Total" value={formatINR(invoice.totalPaise)} />
                <PayRow label="Received" value={formatINR(paidPaise)} />
                <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                  <dt className="font-semibold text-ink">Balance due</dt>
                  <dd className="text-lg font-semibold text-ink">{formatINR(balance)}</dd>
                </div>
              </dl>
              {upi ? (
                <div className="space-y-2 pt-1">
                  <Button asChild variant="secondary" className="w-full">
                    <a href={upi.link}>
                      <Smartphone /> Open in UPI app
                    </a>
                  </Button>
                  <CopyUpiLinkButton link={upi.link} className="w-full" />
                  <p className="text-xs text-muted">The link opens UPI apps on phones. The QR code on the memo works from print or screen.</p>
                </div>
              ) : balance > 0 && !profile.upiId ? (
                <p className="text-[13px] text-muted">
                  <Link href="/app/fees/settings" className="font-semibold text-primary hover:underline">
                    Add a UPI ID
                  </Link>{" "}
                  to show a Pay by UPI QR code on the memo.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receipts</CardTitle>
            </CardHeader>
            {receipts.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">No payment recorded yet.</p>
              </CardContent>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {receipts.map((r) => (
                  <li key={r.id} className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-5">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-success tabular">+{formatINR(r.amountPaise)}</p>
                      <p className="truncate text-[13px] text-muted tabular">
                        {formatDate(r.receivedOn)} · {receiptModeLabel(r.mode)}
                        {r.reference ? ` · ${r.reference}` : ""}
                      </p>
                    </div>
                    {invoice.status !== "cancelled" ? <RemoveReceiptButton receiptId={r.id} label={`${formatINR(r.amountPaise)} on ${formatDate(r.receivedOn)}`} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {client ? (
            <Link href={`/app/clients/${client.id}`} className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm hover:bg-surface-2/60">
              <Contact className="size-5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted">Client</span>
                <span data-private className="block truncate font-semibold text-ink">
                  {client.name}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}

function PayRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
