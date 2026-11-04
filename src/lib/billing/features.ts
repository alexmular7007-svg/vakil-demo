// Registry of paid features. One entry per feature: how long its free trial lasts,
// which permission always unlocks it, and which add-on sells it alone. Which plans
// include it comes from each plan's `includes` list in src/lib/plans.ts.
//
// Adding a paid feature:
//   1. add an entry here (the key is stored in billing.feature_trials.feature),
//   2. list the key in `includes` of every plan that bundles it (and of its add-on),
//   3. gate it with `hasFeature(await getFeatureAccess(user, "<key>"))`
//      from src/lib/billing/entitlements.ts.
// src/lib/plans.test.ts checks that every entry is purchasable and consistent.
//
// Pure data and functions: safe to import from client components.

import type { Permission } from "@/lib/auth/permissions";
import { UPDATES_TRIAL_DAYS, plansIncluding, type PlanId } from "@/lib/plans";

export type PaidFeatureDef = {
  /** Name shown on paywalls and in the admin console. */
  label: string;
  /** Free trial length in days, started automatically on first use. 0 = no trial. */
  trialDays: number;
  /** Role permission that always unlocks the feature (staff), without a plan or trial. */
  alwaysFor?: Permission;
  /** Add-on plan that sells this feature on its own, if there is one. */
  addon?: PlanId;
};

export const PAID_FEATURES = {
  legal_updates: {
    label: "Daily legal updates",
    trialDays: UPDATES_TRIAL_DAYS,
    alwaysFor: "updates.always",
    addon: "updates",
  },
} as const satisfies Record<string, PaidFeatureDef>;

export type FeatureId = keyof typeof PAID_FEATURES;

export type PaidFeature = PaidFeatureDef & {
  id: FeatureId;
  /** Plans that unlock the feature (derived from the plan catalogue). */
  includedIn: PlanId[];
};

export const FEATURE_IDS = Object.keys(PAID_FEATURES) as FeatureId[];

export function isFeatureId(v: unknown): v is FeatureId {
  return typeof v === "string" && Object.hasOwn(PAID_FEATURES, v);
}

/** The full registry entry, with the plans that include the feature. */
export function paidFeature(id: FeatureId): PaidFeature {
  const def: PaidFeatureDef = PAID_FEATURES[id];
  return { ...def, id, includedIn: plansIncluding(id) };
}

/**
 * Access to one paid feature for one user.
 * - paid: an active plan that includes it (`via` = that plan) or the feature's
 *   `alwaysFor` permission (`via` = "admin"); `until` is null for the latter.
 * - trial: inside the free trial.
 * - expired: the trial has ended and no plan includes it.
 * - locked: no plan includes it and the feature has no trial.
 */
export type FeatureAccess =
  | { status: "paid"; via: "admin" | PlanId; until: Date | null }
  | { status: "trial"; trialEndsAt: Date; daysLeft: number }
  | { status: "expired"; trialEndedAt: Date }
  | { status: "locked" };

/** True when the access allows using the feature (paid or in trial). */
export function hasFeature(a: FeatureAccess): boolean {
  return a.status === "paid" || a.status === "trial";
}

const DAY_MS = 86_400_000;

/** Whole days left in a trial, rounded up, at least 1 while it is running. */
export function trialDaysLeft(endsAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
}

export function trialEndsAt(startedAt: Date, trialDays: number): Date {
  return new Date(startedAt.getTime() + trialDays * DAY_MS);
}

/**
 * Decides access from what the database holds. `subscription` must already be an
 * active one whose period has not ended and whose plan includes the feature.
 */
export function resolveFeatureAccess(input: {
  always: boolean;
  subscription: { planId: PlanId; periodEnd: Date } | null;
  trialEndsAt: Date | null;
  now: Date;
}): FeatureAccess {
  if (input.always) return { status: "paid", via: "admin", until: null };
  if (input.subscription && input.subscription.periodEnd > input.now) {
    return { status: "paid", via: input.subscription.planId, until: input.subscription.periodEnd };
  }
  if (input.trialEndsAt === null) return { status: "locked" };
  if (input.trialEndsAt > input.now) {
    return { status: "trial", trialEndsAt: input.trialEndsAt, daysLeft: trialDaysLeft(input.trialEndsAt, input.now) };
  }
  return { status: "expired", trialEndedAt: input.trialEndsAt };
}
