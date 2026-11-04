import Link from "next/link";
import { BellRing, Check, Clock, Lock, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, IconTile } from "@/components/ui/display";
import { planById } from "@/lib/plans";
import { PAID_FEATURES } from "@/lib/billing/features";
import { chargeFor } from "@/lib/payments/pricing";
import type { UpdatesAccess } from "@/lib/billing/entitlements";
import { formatDate, formatINR } from "@/lib/utils";

const addon = planById[PAID_FEATURES.legal_updates.addon];

/** Shown in place of the updates feed after the free trial ends. */
export function UpdatesPaywall({ access }: { access: Extract<UpdatesAccess, { status: "expired" }> }) {
  const month = chargeFor(addon.id, "month");
  return (
    <section className="brand-surface relative overflow-hidden rounded-2xl p-6 shadow-brand sm:p-8" aria-labelledby="paywall-title">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <span className="glass-on-brand inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-gold-bright">
            <Lock className="size-3.5" /> Free trial ended on {formatDate(access.trialEndedAt)}
          </span>
          <h2 id="paywall-title" className="mt-4 font-serif text-3xl leading-tight font-semibold">
            Keep getting <em className="text-gold-bright">daily legal updates</em>
          </h2>
          <p className="mt-2 max-w-lg text-on-brand-muted">{addon.tagline}.</p>
          <ul className="mt-5 grid gap-2.5">
            {addon.features.slice(0, 4).map((f) => (
              <li key={f} className="flex gap-2.5 text-sm text-on-brand">
                <Check className="mt-0.5 size-4 shrink-0 text-gold-bright" /> {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-on-brand rounded-xl p-5">
          <p className="text-xs font-bold tracking-[0.14em] text-gold-bright uppercase">{addon.name}</p>
          <p className="mt-2">
            <span className="tabular font-serif text-4xl font-semibold">{formatINR(addon.pricePaiseMonth)}</span>
            <span className="text-sm text-on-brand-muted"> / month + GST</span>
          </p>
          <p className="mt-1 text-xs text-on-brand-muted">
            {formatINR(month.totalPaise)} a month with GST, or {formatINR(addon.pricePaiseYear)} a year + GST.
          </p>
          <div className="mt-5 grid gap-2.5">
            <Button asChild variant="gold" size="lg">
              <Link href={`/app/settings/billing?plan=${addon.id}#plans`}>
                <BellRing /> Subscribe to updates
              </Link>
            </Button>
            <Button asChild variant="ghost" className="glass-on-brand text-on-brand hover:bg-white/15 hover:text-on-brand">
              <Link href="/app/settings/billing?plan=pro#plans">Included in Advocate Pro</Link>
            </Button>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-on-brand-muted">
            Amendments to bare acts stay free for everyone in Research. Only the news and alerts feed needs a subscription.
          </p>
        </div>
      </div>
    </section>
  );
}

/** Small banner on the updates page during the free trial. */
export function UpdatesTrialBanner({ access }: { access: Extract<UpdatesAccess, { status: "trial" }> }) {
  return (
    <div className="glass flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center">
      <IconTile icon={Clock} tone="gold" size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">
          Free trial: {access.daysLeft} {access.daysLeft === 1 ? "day" : "days"} left
        </p>
        <p className="text-xs text-muted">
          Daily legal updates are free until {formatDate(access.trialEndsAt)}, then {formatINR(addon.pricePaiseMonth)} a month + GST, or included in
          Advocate Pro.
        </p>
      </div>
      <Button asChild size="sm" variant="secondary">
        <Link href={`/app/settings/billing?plan=${addon.id}#plans`}>
          <Newspaper /> Subscribe
        </Link>
      </Button>
    </div>
  );
}

/** Status line for settings and the admin console. */
export function UpdatesAccessBadge({ access }: { access: UpdatesAccess }) {
  if (access.status === "paid") return <Badge tone="success" dot>{access.until ? `Active until ${formatDate(access.until)}` : "Active"}</Badge>;
  if (access.status === "trial") return <Badge tone="warning" dot>Trial: {access.daysLeft} days left</Badge>;
  return <Badge tone="neutral" dot>Trial ended</Badge>;
}
