// The printable professional fee memo. Presentational, no hooks.
import { formatRateBp, REVERSE_CHARGE_NOTE, rupeesInWords } from "@/lib/fees/money";
import { cn, formatDate, formatINR } from "@/lib/utils";

export type MemoData = {
  number: string;
  issueDate: string;
  dueDate: string | null;
  status: string;
  billTo: { name: string; address?: string; gstin?: string; email?: string };
  items: { description: string; amountPaise: number }[];
  subtotalPaise: number;
  gstMode: string;
  gstRateBp: number;
  taxPaise: number;
  totalPaise: number;
  notes: string | null;
};

export type Letterhead = {
  displayName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
};

const longDate = { day: "numeric", month: "long", year: "numeric" } as const;

export function FeeMemo({
  memo,
  letterhead,
  matter,
  paidPaise,
  upi,
}: {
  memo: MemoData;
  letterhead: Letterhead;
  matter: { title: string; court: string | null; caseNo: string | null; cnr: string | null } | null;
  paidPaise: number;
  upi: { qr: string; vpa: string; amountPaise: number } | null;
}) {
  const cancelled = memo.status === "cancelled";
  const balance = cancelled ? 0 : Math.max(0, memo.totalPaise - paidPaise);
  const title = memo.gstMode === "forward" ? "Tax invoice" : "Professional fee memo";

  return (
    <article className="fee-memo relative rounded-lg border border-border bg-surface px-5 py-6 text-[14px] text-ink shadow-sm sm:px-10 sm:py-10">
      {cancelled ? (
        <p className="mb-4 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-center text-sm font-bold tracking-[0.2em] text-danger uppercase">
          Cancelled
        </p>
      ) : null}

      <div className="flex flex-col gap-5 memo-rule border-b-2 border-ink pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-serif text-[22px] leading-tight font-semibold text-ink">{letterhead.displayName}</p>
          {letterhead.address ? <p className="mt-1 whitespace-pre-line text-ink-2">{letterhead.address}</p> : null}
          {letterhead.phone || letterhead.email ? (
            <p className="mt-1 text-ink-2 tabular">{[letterhead.phone, letterhead.email].filter(Boolean).join(" · ")}</p>
          ) : null}
          {letterhead.gstin ? <p className="mt-1 text-ink-2 tabular">GSTIN: {letterhead.gstin}</p> : null}
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-[11px] font-bold tracking-[0.16em] text-accent uppercase">{title}</p>
          <p className="mt-1 text-lg font-semibold text-ink tabular">{memo.number}</p>
          <dl className="mt-1 space-y-0.5 text-ink-2 tabular">
            <div>
              <dt className="inline">Date: </dt>
              <dd className="inline">{formatDate(memo.issueDate, longDate)}</dd>
            </div>
            {memo.dueDate ? (
              <div>
                <dt className="inline">Due by: </dt>
                <dd className="inline">{formatDate(memo.dueDate, longDate)}</dd>
              </div>
            ) : (
              <div>Payable on receipt</div>
            )}
          </dl>
        </div>
      </div>

      <div className="grid gap-5 py-5 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Bill to</p>
          <p className="mt-1 font-semibold text-ink">{memo.billTo.name}</p>
          {memo.billTo.address ? <p className="whitespace-pre-line text-ink-2">{memo.billTo.address}</p> : null}
          {memo.billTo.gstin ? <p className="text-ink-2 tabular">GSTIN: {memo.billTo.gstin}</p> : null}
          {memo.billTo.email ? <p className="break-all text-ink-2">{memo.billTo.email}</p> : null}
        </div>
        {matter ? (
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Matter</p>
            <p className="mt-1 font-semibold text-ink">{matter.title}</p>
            {matter.court ? <p className="text-ink-2">{matter.court}</p> : null}
            {matter.caseNo ? <p className="text-ink-2 tabular">Case no. {matter.caseNo}</p> : null}
            {matter.cnr ? <p className="text-ink-2 tabular">CNR {matter.cnr}</p> : null}
          </div>
        ) : null}
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="memo-rule border-y border-ink/70">
            <th scope="col" className="w-10 py-2 pr-2 text-[12px] font-bold text-ink-2">
              No.
            </th>
            <th scope="col" className="py-2 pr-2 text-[12px] font-bold text-ink-2">
              Particulars
            </th>
            <th scope="col" className="py-2 text-right text-[12px] font-bold text-ink-2">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {memo.items.map((it, i) => (
            <tr key={i} className="border-b border-border align-top">
              <td className="py-2.5 pr-2 text-ink-2 tabular">{i + 1}</td>
              <td className="py-2.5 pr-2 whitespace-pre-line text-ink">{it.description}</td>
              <td className="py-2.5 text-right text-ink tabular">{formatINR(it.amountPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-1.5 tabular">
          <MemoRow label="Subtotal" value={formatINR(memo.subtotalPaise)} />
          {memo.gstMode === "forward" ? <MemoRow label={`GST @ ${formatRateBp(memo.gstRateBp)}`} value={formatINR(memo.taxPaise)} /> : null}
          <div className="flex items-baseline justify-between gap-4 memo-rule border-t-2 border-ink pt-2">
            <dt className="font-bold text-ink">Total</dt>
            <dd className="text-lg font-bold text-ink">{formatINR(memo.totalPaise)}</dd>
          </div>
          {paidPaise > 0 ? (
            <>
              <MemoRow label="Received" value={`− ${formatINR(paidPaise)}`} />
              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-1.5">
                <dt className="font-semibold text-ink">Balance due</dt>
                <dd className="font-semibold text-ink">{formatINR(balance)}</dd>
              </div>
            </>
          ) : null}
        </dl>
      </div>

      <p className="mt-4 text-ink-2">
        <span className="font-semibold text-ink">Amount in words: </span>
        {rupeesInWords(memo.totalPaise)}
      </p>

      {memo.gstMode === "reverse_charge" ? <p className="mt-3 font-semibold text-ink">{REVERSE_CHARGE_NOTE}.</p> : null}

      {memo.notes ? <p className="mt-3 whitespace-pre-line text-ink-2">{memo.notes}</p> : null}

      <div className={cn("mt-8 flex flex-col gap-6 sm:flex-row sm:items-end", upi ? "sm:justify-between" : "sm:justify-end")}>
        {upi ? (
          <div className="memo-upi flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
            <img src={upi.qr} alt={`UPI QR code to pay ${formatINR(upi.amountPaise)}`} width={120} height={120} className="size-[120px] shrink-0 rounded-sm" />
            <div className="min-w-0 text-[13px] text-ink-2">
              <p className="font-semibold text-ink">Pay by UPI</p>
              <p className="tabular">Scan with any UPI app to pay {formatINR(upi.amountPaise)}.</p>
              <p className="mt-1 break-all tabular">UPI ID: {upi.vpa}</p>
            </div>
          </div>
        ) : null}
        <div className="text-center sm:min-w-56">
          <div className="h-12" aria-hidden />
          <p className="memo-rule border-t border-ink/60 pt-1.5 text-[13px] text-ink-2">For {letterhead.displayName}</p>
        </div>
      </div>
    </article>
  );
}

function MemoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
