"use client";

import { useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import { Check, ExternalLink, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { startCheckout } from "@/app/app/settings/billing/actions";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { Dialog, Tabs } from "@/components/ui/overlay";
import type { PlanId } from "@/lib/plans";
import { cn, formatINR } from "@/lib/utils";

export type PlanCard = {
  id: PlanId;
  kind: "main" | "addon";
  name: string;
  tagline: string;
  features: string[];
  highlight: boolean;
  /** Has a price; free plans show no checkout button. */
  paid: boolean;
  perSeat?: boolean;
  month: { basePaise: number; gstPaise: number; totalPaise: number };
  year: { basePaise: number; gstPaise: number; totalPaise: number };
};

type Interval = "month" | "year";

export function BillingPlans({
  plans,
  currentPlanId,
  selectedPlanId,
  paymentsEnabled,
  defaultMobile,
}: {
  plans: PlanCard[];
  currentPlanId: string;
  selectedPlanId: string | null;
  paymentsEnabled: boolean;
  defaultMobile: string;
}) {
  const [interval, setBillingInterval] = useState<Interval>("month");
  const [checkoutPlan, setCheckoutPlan] = useState<PlanCard | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [upi, setUpi] = useState<{ intent: string; qr: string | null } | null>(null);
  const [pending, start] = useTransition();

  // ?plan=pro|chambers (e.g. from the pricing page): bring that plan into view.
  useEffect(() => {
    if (!selectedPlanId) return;
    document.getElementById(`plan-${selectedPlanId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedPlanId]);

  const upiIntent = upi?.intent ?? null;
  useEffect(() => {
    if (!upiIntent) return;
    let cancelled = false;
    QRCode.toDataURL(upiIntent, { margin: 1, width: 224 })
      .then((qr) => {
        if (!cancelled) setUpi({ intent: upiIntent, qr });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [upiIntent]);

  function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!checkoutPlan || !checkoutPlan.paid) return;
    const mobile = String(new FormData(e.currentTarget).get("mobile") ?? "");
    const planId = checkoutPlan.id;
    start(async () => {
      const res = await startCheckout({ planId, interval, mobile });
      if (!res.ok) {
        setMobileError(res.fieldErrors?.mobile ?? null);
        toast.error(res.error);
        return;
      }
      setMobileError(null);
      if (res.data.redirectUrl) {
        window.location.assign(res.data.redirectUrl);
        return;
      }
      if (res.data.upiIntent) setUpi({ intent: res.data.upiIntent, qr: null });
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[
            { value: "month", label: "Monthly" },
            { value: "year", label: "Yearly" },
          ]}
          value={interval}
          onChange={(v) => setBillingInterval(v as Interval)}
        />
        <p className="text-sm text-muted">Prices plus 18% GST. The total is shown before you pay.</p>
      </div>

      <div className={cn("grid grid-cols-1 gap-4", plans.length === 1 ? "max-w-md" : "md:grid-cols-3")}>
        {plans.map((p) => {
          const price = p[interval];
          const isCurrent = p.id === currentPlanId;
          const isSelected = p.id === selectedPlanId;
          return (
            <div
              key={p.id}
              id={`plan-${p.id}`}
              className={cn(
                "flex flex-col rounded-xl border bg-surface p-5",
                isSelected ? "border-primary ring-2 ring-primary/30" : p.highlight ? "border-primary/50" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-ink">{p.name}</h3>
                {isCurrent ? <Badge tone="success">{p.kind === "addon" ? "Active" : "Current plan"}</Badge> : p.highlight ? <Badge tone="accent">Recommended</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted">{p.tagline}</p>
              <p className="mt-4">
                <span className="font-serif text-3xl font-semibold text-ink">{formatINR(price.basePaise)}</span>
                <span className="text-sm text-muted">
                  {!p.paid ? "" : interval === "year" ? " / year" : " / month"}
                  {p.perSeat ? " per seat" : ""}
                </span>
              </p>
              {p.paid ? <p className="text-xs text-muted">{formatINR(price.totalPaise)} incl. GST</p> : <p className="text-xs text-muted">Free forever</p>}
              <ul className="mt-4 flex-1 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-ink-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {f}
                  </li>
                ))}
              </ul>
              {!p.paid ? null : (
                <Button
                  className="mt-5"
                  variant={p.highlight || isSelected ? "primary" : "outline"}
                  disabled={!paymentsEnabled}
                  onClick={() => {
                    setUpi(null);
                    setMobileError(null);
                    setCheckoutPlan(p);
                  }}
                >
                  {isCurrent ? "Renew" : `Choose ${p.name}`}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog
        open={checkoutPlan !== null}
        onClose={() => {
          setCheckoutPlan(null);
          setUpi(null);
        }}
        title={checkoutPlan ? `${checkoutPlan.name}, ${interval === "year" ? "yearly" : "monthly"}` : ""}
        description="Pay by UPI through our payment partner."
      >
        {checkoutPlan && checkoutPlan.paid ? (
          upi ? (
            <div className="grid gap-4 text-center">
              <p className="text-sm text-ink-2">Scan with any UPI app, or open your UPI app on this phone.</p>
              <div className="flex justify-center">
                {upi.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={upi.qr} alt="UPI payment QR code" width={224} height={224} className="rounded-lg border border-border bg-white p-2" />
                ) : (
                  <div className="flex size-56 items-center justify-center rounded-lg border border-border">
                    <Loader2 className="size-5 animate-spin text-muted" aria-label="Creating QR code" />
                  </div>
                )}
              </div>
              <Button asChild variant="outline" className="sm:hidden">
                <a href={upi.intent}>
                  <Smartphone /> Open UPI app
                </a>
              </Button>
              <Alert tone="info">
                Your plan changes as soon as the payment partner confirms the payment, usually within a minute. Refresh this
                page after paying.
              </Alert>
            </div>
          ) : (
            <form onSubmit={pay} className="grid gap-4">
              <dl className="grid gap-1.5 rounded-lg bg-surface-2 p-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-2">Plan price</dt>
                  <dd className="text-ink">{formatINR(checkoutPlan[interval].basePaise)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-2">GST (18%)</dt>
                  <dd className="text-ink">{formatINR(checkoutPlan[interval].gstPaise)}</dd>
                </div>
                <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold">
                  <dt className="text-ink">Total</dt>
                  <dd className="text-ink">{formatINR(checkoutPlan[interval].totalPaise)}</dd>
                </div>
              </dl>
              <Field label="Mobile number for the UPI request" htmlFor="mobile" error={mobileError}>
                <Input id="mobile" name="mobile" type="tel" inputMode="tel" autoComplete="tel" defaultValue={defaultMobile} placeholder="98xxxxxxxx" required />
              </Field>
              <p className="text-xs text-muted">
                You will be taken to our payment partner. We never see your UPI PIN or bank details. Plans renew only when
                you pay again; there is no auto-debit.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setCheckoutPlan(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
                  Pay {formatINR(checkoutPlan[interval].totalPaise)}
                </Button>
              </div>
            </form>
          )
        ) : null}
      </Dialog>
    </div>
  );
}
