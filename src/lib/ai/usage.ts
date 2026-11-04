import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions, usageLedger } from "@/lib/db/schema";
import { MAIN_PLAN_IDS, planById, type PlanId } from "@/lib/plans";
import { costMicros, type Provider, type Tier } from "./config";
import { FairUseLimitError } from "./errors";

function istDay(d = new Date()) {
  // YYYY-MM-DD in Asia/Kolkata, so daily limits reset at Indian midnight.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

export async function activePlanId(userId: string): Promise<PlanId> {
  const [sub] = await db
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        gt(subscriptions.periodEnd, new Date()),
        // The updates add-on does not change AI limits.
        inArray(subscriptions.planId, MAIN_PLAN_IDS),
      ),
    )
    .orderBy(desc(subscriptions.periodEnd))
    .limit(1);
  return (sub?.planId as PlanId) ?? "free";
}

export async function todaysUsage(userId: string) {
  const [row] = await db
    .select({ queries: usageLedger.queries })
    .from(usageLedger)
    .where(and(eq(usageLedger.userId, userId), eq(usageLedger.day, istDay())))
    .limit(1);
  return row?.queries ?? 0;
}

/**
 * "Unlimited with fair use": past the plan's soft cap the request moves to the
 * fast model; past the hard cap it stops until the next day. Pro tier is only
 * available on plans that include it.
 */
export async function applyFairUse(userId: string, requested: Tier): Promise<{ tier: Tier; downgraded: boolean }> {
  const plan = planById[await activePlanId(userId)];
  const used = await todaysUsage(userId);
  if (used >= plan.limits.dailyHardCap) throw new FairUseLimitError(plan.limits.dailyHardCap);
  let tier = requested;
  if (!plan.limits.modelTiers.includes(tier)) tier = "standard";
  if (used >= plan.limits.dailySoftCap && tier !== "fast") return { tier: "fast", downgraded: true };
  return { tier, downgraded: false };
}

/** Tokens one provider attempt was billed for. */
export type BilledUsage = { provider: Provider; tier: Tier; tokensIn: number; tokensOut: number };

/** Ledger increments for one request: its billed attempts and whether it counts as a query. */
export function usageTotals(attempts: BilledUsage[], countsAsQuery: boolean) {
  let tokensIn = 0;
  let tokensOut = 0;
  let cost = 0;
  for (const a of attempts) {
    tokensIn += a.tokensIn;
    tokensOut += a.tokensOut;
    cost += costMicros(a.provider, a.tier, a.tokensIn, a.tokensOut);
  }
  return { queries: countsAsQuery ? 1 : 0, tokensIn, tokensOut, costMicros: cost };
}

/**
 * Adds one request to today's ledger. A request counts towards fair use when it
 * answered (or was stopped by the user after text arrived); tokens and cost of
 * every billed attempt are recorded either way, including failed attempts the
 * provider charged for.
 */
export async function recordUsage(userId: string, attempts: BilledUsage[], countsAsQuery: boolean): Promise<void> {
  const t = usageTotals(attempts, countsAsQuery);
  if (t.queries === 0 && t.tokensIn === 0 && t.tokensOut === 0) return;
  await db
    .insert(usageLedger)
    .values({ userId, day: istDay(), queries: t.queries, tokensIn: t.tokensIn, tokensOut: t.tokensOut, costMicros: t.costMicros })
    .onConflictDoUpdate({
      target: [usageLedger.userId, usageLedger.day],
      set: {
        queries: sql`${usageLedger.queries} + ${t.queries}`,
        tokensIn: sql`${usageLedger.tokensIn} + ${t.tokensIn}`,
        tokensOut: sql`${usageLedger.tokensOut} + ${t.tokensOut}`,
        costMicros: sql`${usageLedger.costMicros} + ${t.costMicros}`,
      },
    });
}
