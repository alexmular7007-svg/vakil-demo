import "server-only";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { featureTrials, subscriptions } from "@/lib/db/schema";
import { can } from "@/lib/auth/permissions";
import { isPlanId, type PlanId } from "@/lib/plans";
import {
  hasFeature,
  paidFeature,
  resolveFeatureAccess,
  trialEndsAt,
  type FeatureAccess,
  type FeatureId,
} from "./features";

export { hasFeature, type FeatureAccess, type FeatureId } from "./features";

type EntitledUser = { id: string; role?: string | null };

/**
 * Access to a paid feature (registry: src/lib/billing/features.ts), in order:
 *   1. the feature's `alwaysFor` permission (admins): always paid, no trial row;
 *   2. an active subscription whose plan includes the feature and whose period has
 *      not ended (access stops exactly at `periodEnd`; cancelled and past_due rows
 *      never count);
 *   3. the free trial, started automatically the first time this is checked for the
 *      user and never restarted or extended afterwards.
 *
 * Runs on the owner connection after the caller has authenticated the user (pass
 * the session user, never an id from input). Trial and subscription rows are
 * read-only for app_user, so nothing the browser sends can create or extend them.
 * `now` exists for tests.
 */
export async function getFeatureAccess(user: EntitledUser, feature: FeatureId, opts?: { now?: Date }): Promise<FeatureAccess> {
  const def = paidFeature(feature);
  const now = opts?.now ?? new Date();
  if (def.alwaysFor && can(user, def.alwaysFor)) return resolveFeatureAccess({ always: true, subscription: null, trialEndsAt: null, now });

  const [sub] = def.includedIn.length
    ? await db
        .select({ planId: subscriptions.planId, periodEnd: subscriptions.periodEnd })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, user.id),
            eq(subscriptions.status, "active"),
            gt(subscriptions.periodEnd, now),
            inArray(subscriptions.planId, def.includedIn),
          ),
        )
        .orderBy(desc(subscriptions.periodEnd))
        .limit(1)
    : [];
  if (sub && isPlanId(sub.planId)) {
    return resolveFeatureAccess({ always: false, subscription: { planId: sub.planId, periodEnd: sub.periodEnd }, trialEndsAt: null, now });
  }

  const endsAt = def.trialDays > 0 ? await ensureTrial(user.id, feature, def.trialDays, now) : null;
  return resolveFeatureAccess({ always: false, subscription: null, trialEndsAt: endsAt, now });
}

/** The trial's end, starting it on first use. An existing trial is returned unchanged. */
async function ensureTrial(userId: string, feature: FeatureId, trialDays: number, now: Date): Promise<Date> {
  const existing = await readTrialEnd(userId, feature);
  if (existing) return existing;
  const [created] = await db
    .insert(featureTrials)
    .values({ userId, feature, startedAt: now, endsAt: trialEndsAt(now, trialDays) })
    .onConflictDoNothing()
    .returning({ endsAt: featureTrials.endsAt });
  // Lost a race with a concurrent first check: the other request's row wins.
  return created?.endsAt ?? (await readTrialEnd(userId, feature)) ?? now;
}

async function readTrialEnd(userId: string, feature: FeatureId): Promise<Date | null> {
  const [row] = await db
    .select({ endsAt: featureTrials.endsAt })
    .from(featureTrials)
    .where(and(eq(featureTrials.userId, userId), eq(featureTrials.feature, feature)))
    .limit(1);
  return row?.endsAt ?? null;
}

/* ----------------------------- daily legal updates ----------------------------- */

export type UpdatesAccess =
  // Today: "admin" | "pro" | "chambers" | "updates". The free plan never includes a paid feature.
  | { status: "paid"; via: "admin" | Exclude<PlanId, "free">; until: Date | null }
  | { status: "trial"; trialEndsAt: Date; daysLeft: number }
  | { status: "expired"; trialEndedAt: Date };

/** True when the user may see the daily legal-updates feed, pop-ups and alerts. */
export function hasUpdatesAccess(a: UpdatesAccess) {
  return hasFeature(a);
}

/**
 * Who can see daily legal updates: admins, subscribers to a plan that includes the
 * feature (Advocate Pro, Chambers, the updates add-on), and everyone during the free
 * trial (UPDATES_TRIAL_DAYS). Thin wrapper over getFeatureAccess("legal_updates").
 */
export async function getUpdatesAccess(user: EntitledUser): Promise<UpdatesAccess> {
  const now = new Date();
  return toUpdatesAccess(await getFeatureAccess(user, "legal_updates", { now }), now);
}

function toUpdatesAccess(a: FeatureAccess, now: Date): UpdatesAccess {
  switch (a.status) {
    case "paid":
      return isUpdatesVia(a.via) ? { status: "paid", via: a.via, until: a.until } : { status: "expired", trialEndedAt: now };
    case "trial":
    case "expired":
      return a;
    case "locked":
      return { status: "expired", trialEndedAt: now };
  }
}

function isUpdatesVia(via: "admin" | PlanId): via is Extract<UpdatesAccess, { status: "paid" }>["via"] {
  return via !== "free";
}
