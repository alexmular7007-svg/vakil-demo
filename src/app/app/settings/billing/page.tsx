import type { Metadata } from "next";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { Receipt } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { db, withUser } from "@/lib/db";
import { payments, subscriptions, user as userTable } from "@/lib/db/schema";
import { activePlanId, todaysUsage } from "@/lib/ai/gateway";
import { addons, fairUsePolicy, findPlan, MAIN_PLAN_IDS, planById, plans, UPDATES_TRIAL_DAYS, type Plan } from "@/lib/plans";
import { getUpdatesAccess } from "@/lib/billing/entitlements";
import { UpdatesAccessBadge } from "@/components/billing/updates-paywall";
import { PAID_FEATURES } from "@/lib/billing/features";
import { chargeFor, isPaidPlan } from "@/lib/payments/pricing";
import { paymentsConfigured } from "@/lib/payments/provider";
import { Alert, Badge, EmptyState, Table, Td, Th } from "@/components/ui/display";
import { BillingPlans, type PlanCard } from "@/components/settings/billing-plans";
import { SettingsSection } from "@/components/settings/section";
import { cn, formatDate, formatDateTime, formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const paymentTone = { paid: "success", failed: "danger", created: "warning" } as const;
const paymentLabel = { paid: "Paid", failed: "Failed", created: "Awaiting confirmation" } as const;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function BillingSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser("/app/settings/billing");
  const sp = await searchParams;
  const selected = one(sp.plan) ?? "";
  const selectedPlanId = isPaidPlan(selected) ? selected : null;
  const returned = one(sp.checkout) === "returned";

  const [planId, used, [me], { sub, history }, updatesAccess] = await Promise.all([
    activePlanId(user.id),
    todaysUsage(user.id),
    db.select({ phone: userTable.phone }).from(userTable).where(eq(userTable.id, user.id)).limit(1),
    withUser(user.id, async (tx) => {
      const [s] = await tx
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.status, "active"), gt(subscriptions.periodEnd, new Date()), inArray(subscriptions.planId, MAIN_PLAN_IDS)))
        .orderBy(desc(subscriptions.periodEnd))
        .limit(1);
      const h = await tx.select().from(payments).orderBy(desc(payments.createdAt)).limit(20);
      return { sub: s ?? null, history: h };
    }),
    getUpdatesAccess(user),
  ]);

  const plan = planById[planId];
  const { dailySoftCap, dailyHardCap } = plan.limits;
  const softPct = Math.min(100, Math.round((used / Math.max(1, dailySoftCap)) * 100));
  const enabled = paymentsConfigured();

  const toCard = (p: Plan): PlanCard => ({
    id: p.id,
    kind: p.kind,
    name: p.name,
    tagline: p.tagline,
    features: p.features,
    highlight: p.kind === "main" && Boolean(p.highlight),
    paid: isPaidPlan(p.id),
    perSeat: Boolean(p.perSeat),
    month: chargeFor(p.id, "month"),
    year: chargeFor(p.id, "year"),
  });
  const cards = plans.map(toCard);
  const addonCards = addons.map(toCard);
  const updatesAddon = PAID_FEATURES.legal_updates.addon;
  // Included = unlocked by the main plan (or staff access), not by the add-on itself.
  const updatesIncluded = updatesAccess.status === "paid" && updatesAccess.via !== updatesAddon;

  const awaiting = history.filter((h) => h.status === "created");

  return (
    <div className="space-y-6">
      {returned ? (
        <Alert tone="info" title="Thanks. We are waiting for the payment partner to confirm.">
          Your plan changes only after the payment partner confirms the payment to our server, usually within a minute.
          Refresh this page to see the update. If money left your account and nothing changes within an hour, write to us
          with the order number{one(sp.order) ? ` ${one(sp.order)?.slice(0, 40)}` : ""}.
        </Alert>
      ) : null}

      <SettingsSection title="Current plan">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="font-serif text-2xl font-semibold text-ink">{plan.name}</p>
            <p className="text-sm text-muted">{plan.tagline}</p>
            {sub ? (
              <p className="mt-3 text-sm text-ink-2">
                Paid {sub.interval === "year" ? "yearly" : "monthly"} · valid until <strong className="text-ink">{formatDate(sub.periodEnd)}</strong>
              </p>
            ) : !isPaidPlan(planId) ? (
              <p className="mt-3 text-sm text-ink-2">No payment needed.</p>
            ) : null}
          </div>
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-ink">AI questions today</span>
              <span className="text-ink-2">
                {used} of {dailySoftCap}
                {dailyHardCap > dailySoftCap ? ` (limit ${dailyHardCap})` : ""}
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label="AI questions used today"
              aria-valuemin={0}
              aria-valuemax={dailySoftCap}
              aria-valuenow={Math.min(used, dailySoftCap)}
            >
              <div className={cn("h-full rounded-full", softPct >= 100 ? "bg-warning" : "bg-primary")} style={{ width: `${softPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {used >= dailyHardCap
                ? "You have reached today's limit. It resets at midnight IST."
                : used >= dailySoftCap
                  ? "Past the fair-use threshold: answers use the faster model until midnight IST."
                  : dailyHardCap > dailySoftCap
                    ? `After ${dailySoftCap} questions, answers move to a faster model until midnight IST.`
                    : "Resets at midnight IST."}
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Plans" description={fairUsePolicy} id="plans">
        {!enabled ? (
          <Alert tone="warning" title="Online payments are not configured yet" className="mb-5">
            Plans can be compared here, but checkout is switched off until the payment partner is connected. Nothing is
            charged and no plan changes from this page.
          </Alert>
        ) : null}
        {awaiting.length > 0 ? (
          <Alert tone="info" className="mb-5">
            {awaiting.length === 1 ? "One payment is" : `${awaiting.length} payments are`} awaiting confirmation from the
            payment partner.
          </Alert>
        ) : null}
        <BillingPlans
          plans={cards}
          currentPlanId={planId}
          selectedPlanId={selectedPlanId && findPlan(selectedPlanId)?.kind === "main" ? selectedPlanId : null}
          paymentsEnabled={enabled}
          defaultMobile={(me?.phone ?? "").replace(/^\+91/, "")}
        />
      </SettingsSection>

      <SettingsSection
        title="Daily legal updates"
        id="updates"
        description={`Daily law, court and advocate news with pop-up alerts when a new law or amendment lands. Every account gets ${UPDATES_TRIAL_DAYS} days free; Advocate Pro and Chambers include it.`}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          Status: <UpdatesAccessBadge access={updatesAccess} />
          {updatesIncluded ? <span className="text-muted">Included in your plan; no add-on needed.</span> : null}
        </div>
        {updatesIncluded ? null : (
          <BillingPlans
            plans={addonCards}
            currentPlanId={updatesAccess.status === "paid" && updatesAccess.via === updatesAddon ? updatesAddon : ""}
            selectedPlanId={selectedPlanId && findPlan(selectedPlanId)?.kind === "addon" ? selectedPlanId : null}
            paymentsEnabled={enabled}
            defaultMobile={(me?.phone ?? "").replace(/^\+91/, "")}
          />
        )}
      </SettingsSection>

      <SettingsSection title="Payment history">
        {history.length === 0 ? (
          <EmptyState icon={Receipt} title="No payments yet" description="Payments you make for a plan appear here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Plan</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell">Order</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(h.createdAt)}</Td>
                  <Td>
                    {findPlan(h.planId)?.name ?? "—"}
                    {h.interval ? <span className="text-muted"> · {h.interval === "year" ? "yearly" : "monthly"}</span> : null}
                  </Td>
                  <Td className="text-right whitespace-nowrap">{formatINR(h.amountPaise)}</Td>
                  <Td>
                    <Badge tone={paymentTone[h.status as keyof typeof paymentTone] ?? "neutral"}>
                      {paymentLabel[h.status as keyof typeof paymentLabel] ?? h.status}
                    </Badge>
                  </Td>
                  <Td className="hidden font-mono text-xs sm:table-cell">{h.providerOrderId ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SettingsSection>
    </div>
  );
}
