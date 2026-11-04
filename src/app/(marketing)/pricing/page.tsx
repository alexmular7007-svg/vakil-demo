import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, IconTile } from "@/components/ui/display";
import { addons, fairUsePolicy, plans, UPDATES_TRIAL_DAYS } from "@/lib/plans";
import { cn, formatINR } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free, Advocate Pro and Chambers plans for Vaakil AI, plus the Daily legal updates add-on with a 15-day free trial. Unlimited standard questions on paid plans under a published fair-use policy.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Simple, honest pricing</h1>
        <p className="mt-4 text-ink-2">Prices in Indian rupees, plus 18% GST. Pay monthly or save about two months with yearly billing.</p>
      </div>
      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex flex-col rounded-xl border bg-surface p-6",
              p.highlight ? "border-primary shadow-lg ring-1 ring-primary" : "border-border shadow-sm",
            )}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">{p.name}</h2>
              {p.highlight ? <Badge tone="accent">Recommended</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted">{p.tagline}</p>
            <p className="mt-5">
              <span className="font-serif text-4xl font-semibold text-ink">{formatINR(p.pricePaiseMonth)}</span>
              <span className="text-sm text-muted"> / month{p.id === "chambers" ? " per seat" : ""}</span>
            </p>
            {p.pricePaiseYear > 0 ? (
              <p className="mt-1 text-sm text-muted">or {formatINR(p.pricePaiseYear)} billed yearly</p>
            ) : (
              <p className="mt-1 text-sm text-muted">Free forever</p>
            )}
            <ul className="mt-6 flex-1 space-y-2.5">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-sm text-ink-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {f}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-7" variant={p.highlight ? "primary" : "outline"}>
              <Link href={p.id === "free" ? "/signup" : `/signup?plan=${p.id}`}>{p.id === "free" ? "Start free" : `Choose ${p.name}`}</Link>
            </Button>
          </div>
        ))}
      </div>
      {addons.map((a) => (
        <div key={a.id} className="brand-surface mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-6 rounded-2xl p-6 shadow-brand sm:p-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-center">
          <div>
            <div className="flex items-center gap-3">
              <IconTile icon={BellRing} tone="brand" className="glass-on-brand" />
              <div>
                <p className="text-xs font-bold tracking-[0.14em] text-gold-bright uppercase">Add-on</p>
                <h2 className="font-serif text-2xl font-semibold">{a.name}</h2>
              </div>
            </div>
            <p className="mt-3 text-on-brand-muted">{a.tagline}.</p>
            <ul className="mt-4 grid gap-2">
              {a.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-sm text-on-brand">
                  <Check className="mt-0.5 size-4 shrink-0 text-gold-bright" /> {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass-on-brand rounded-xl p-5">
            <Badge tone="accent">{UPDATES_TRIAL_DAYS} days free</Badge>
            <p className="mt-3">
              <span className="tabular font-serif text-4xl font-semibold">{formatINR(a.pricePaiseMonth)}</span>
              <span className="text-sm text-on-brand-muted"> / month after the trial</span>
            </p>
            <p className="mt-1 text-sm text-on-brand-muted">or {formatINR(a.pricePaiseYear)} billed yearly. Included in Advocate Pro and Chambers.</p>
            <Button asChild variant="gold" className="mt-5 w-full">
              <Link href="/signup">Start the free trial</Link>
            </Button>
            <p className="mt-2 text-[11px] text-on-brand-muted">No card needed for the trial. Bare-act amendments stay free for everyone.</p>
          </div>
        </div>
      ))}

      <div className="mx-auto mt-12 max-w-3xl rounded-lg border border-border bg-surface p-6">
        <h2 className="font-semibold text-ink">Fair-use policy</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{fairUsePolicy}</p>
      </div>
    </div>
  );
}
