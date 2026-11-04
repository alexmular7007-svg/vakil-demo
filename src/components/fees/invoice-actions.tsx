"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Ban, Check, Copy, HandCoins, Loader2, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { paiseToInputValue } from "@/lib/fees/money";
import { formatINR } from "@/lib/utils";
import { cancelInvoice, deleteReceipt, recordReceipt } from "@/app/app/fees/actions";
import { useConfirm } from "@/components/ui/confirm";

export function PrintMemoButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer /> Print or save as PDF
    </Button>
  );
}

const refLabel: Record<string, string> = {
  upi: "UPI transaction ID (UTR)",
  bank: "Bank reference (UTR)",
  cheque: "Cheque number and bank",
  cash: "Reference (optional)",
};

export function RecordReceiptButton({ invoiceId, balancePaise, today }: { invoiceId: string; balancePaise: number; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("upi");
  const [errors, setErrors] = useState<Record<string, string>>();
  const [pending, start] = useTransition();
  const uid = useId();
  const f = (n: string) => `${uid}-${n}`;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <HandCoins /> Record receipt
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record a fee receipt" description={`Balance due ${formatINR(balancePaise)}`}>
        {open ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                const r = await recordReceipt(invoiceId, fd);
                if (!r.ok) {
                  setErrors(r.fieldErrors);
                  toast.error(r.error);
                  return;
                }
                setErrors(undefined);
                setOpen(false);
                toast.success("Receipt recorded");
                router.refresh();
              });
            }}
            className="grid gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount (₹)" htmlFor={f("amount")} required error={errors?.amount}>
                <Input id={f("amount")} name="amount" defaultValue={paiseToInputValue(balancePaise)} inputMode="decimal" required className="tabular" />
              </Field>
              <Field label="Received on" htmlFor={f("date")} required error={errors?.receivedOn}>
                <Input id={f("date")} name="receivedOn" type="date" defaultValue={today} max={today} required className="tabular" />
              </Field>
              <Field label="Mode" htmlFor={f("mode")} error={errors?.mode}>
                <Select id={f("mode")} name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank transfer (NEFT/RTGS/IMPS)</option>
                  <option value="cheque">Cheque</option>
                  <option value="cash">Cash</option>
                </Select>
              </Field>
              <Field label={refLabel[mode] ?? "Reference"} htmlFor={f("ref")} error={errors?.reference}>
                <Input id={f("ref")} name="reference" maxLength={120} autoComplete="off" className="tabular" />
              </Field>
            </div>
            <Field label="Note" htmlFor={f("notes")} error={errors?.notes}>
              <Textarea id={f("notes")} name="notes" maxLength={500} rows={2} className="min-h-16" />
            </Field>
            <p className="text-xs text-muted">Record professional fees only. Client money held for court fees or deposits belongs in a separate account (BCI Rule 25).</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />} Save receipt
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}

export function CancelInvoiceButton({ invoiceId, number }: { invoiceId: string; number: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setOpen(true)}>
        <Ban /> Cancel memo
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel ${number}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await cancelInvoice(invoiceId);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  setOpen(false);
                  toast.success("Memo cancelled");
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Ban />} Cancel memo
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          The memo stays in your fee book marked as cancelled and its number is not reused. It no longer counts towards billed or outstanding amounts.
        </p>
      </Dialog>
    </>
  );
}

export function RemoveReceiptButton({ receiptId, label }: { receiptId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted hover:text-danger"
      aria-label={`Remove receipt: ${label}`}
      disabled={pending}
      onClick={async () => {
        if (!(await confirm({ title: "Remove this receipt?", description: "Use this only for an entry made by mistake. The removal is recorded in the audit log.", confirmLabel: "Remove", tone: "danger" }))) return;
        start(async () => {
          const r = await deleteReceipt(receiptId);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success("Receipt removed");
            router.refresh();
          }
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}

export function CopyUpiLinkButton({ link, className }: { link: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          toast.success("UPI payment link copied");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Could not copy. Select the link and copy it instead.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />} Copy payment link
    </Button>
  );
}
