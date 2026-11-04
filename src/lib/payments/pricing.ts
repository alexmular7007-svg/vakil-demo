import { BILLING_INTERVALS } from "@/lib/db/schema/enums";
import { MAIN_PLAN_IDS, findPlan, planById, planIsPaid, type PlanId } from "@/lib/plans";

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** GST on SaaS subscriptions (SAC 998314). Plan prices are shown "plus 18% GST". */
export const GST_RATE = 0.18;

export type Charge = { planId: PlanId; interval: BillingInterval; basePaise: number; gstPaise: number; totalPaise: number };

/** The exact amount a checkout charges and the webhook must confirm. Single source of truth. */
export function chargeFor(planId: PlanId, interval: BillingInterval): Charge {
  const plan = planById[planId];
  const basePaise = interval === "year" ? plan.pricePaiseYear : plan.pricePaiseMonth;
  const gstPaise = Math.round(basePaise * GST_RATE);
  return { planId, interval, basePaise, gstPaise, totalPaise: basePaise + gstPaise };
}

export function isBillingInterval(v: unknown): v is BillingInterval {
  return typeof v === "string" && (BILLING_INTERVALS as readonly string[]).includes(v);
}

/** A catalogue plan with a price above zero (derived from the plan data). */
export function isPaidPlan(planId: string): planId is Exclude<PlanId, "free"> {
  const plan = findPlan(planId);
  return plan !== undefined && planIsPaid(plan);
}

/** Can this plan be bought for this interval? Paid plan, known interval, price above zero. */
export function isPurchasable(planId: string, interval: string): boolean {
  return isPaidPlan(planId) && isBillingInterval(interval) && chargeFor(planId, interval).basePaise > 0;
}

/**
 * Plans in the same group replace each other; an add-on never replaces the main plan.
 * Main plans share one group; each add-on is its own group. Unknown ids get no group.
 */
export function planGroup(planId: string): PlanId[] {
  const plan = findPlan(planId);
  if (!plan) return [];
  return plan.kind === "addon" ? [plan.id] : [...MAIN_PLAN_IDS];
}

/** Adds one billing period to a date (calendar month or year). */
export function addInterval(from: Date, interval: BillingInterval): Date {
  const d = new Date(from);
  if (interval === "year") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}
