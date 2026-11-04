// Plan catalogue. Shared by the pricing page, the billing seed and fair-use checks.
// Prices are the proposed launch prices; edit here and re-run `npm run db:seed`.
// Everything else about plans (main vs add-on groups, which plans are paid, which
// plans include a paid feature) is derived from this data below, never from id
// literals. src/lib/plans.test.ts validates the catalogue.
// Pure data: safe to import from client components.

import type { FeatureId } from "@/lib/billing/features";

/** Every plan id. Each must have exactly one entry in `allPlans` (seeded into billing.plans). */
export const PLAN_IDS = ["free", "pro", "chambers", "updates"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanLimits = {
  /** Standard AI questions per day before answers move to the fast model. */
  dailySoftCap: number;
  /** Absolute daily ceiling (abuse protection). */
  dailyHardCap: number;
  /** Credits for heavy tasks: long drafts, case bundles, bulk translation. */
  monthlyCredits: number;
  /** Model tiers the plan may use. */
  modelTiers: ("fast" | "standard" | "pro")[];
  esignEnvelopesPerMonth: number;
  storageMb: number;
  customAssistants: number;
};

export type Plan = {
  id: PlanId;
  /** main = one at a time (free/pro/chambers); addon = bought alongside any main plan. */
  kind: "main" | "addon";
  name: string;
  tagline: string;
  /** Integer paise before GST. A plan with both prices 0 is free and cannot be bought. */
  pricePaiseMonth: number;
  pricePaiseYear: number;
  highlight?: boolean;
  /** Priced per seat (shown as "per seat"). */
  perSeat?: boolean;
  /** Marketing bullet points. */
  features: string[];
  /** Paid features this plan unlocks (registry: src/lib/billing/features.ts). */
  includes: FeatureId[];
  limits: PlanLimits;
};

export const plans: Plan[] = [
  {
    id: "free",
    kind: "main",
    name: "Free",
    tagline: "Try cited research and drafting",
    pricePaiseMonth: 0,
    pricePaiseYear: 0,
    features: [
      "15 AI questions a day",
      "Bare acts and IPC → BNS converter",
      "5 drafts a month from Indian templates",
      "2 e-sign envelopes a month",
      "English and Hindi",
    ],
    includes: [],
    limits: {
      dailySoftCap: 15,
      dailyHardCap: 15,
      monthlyCredits: 0,
      modelTiers: ["fast", "standard"],
      esignEnvelopesPerMonth: 2,
      storageMb: 100,
      customAssistants: 1,
    },
  },
  {
    id: "pro",
    kind: "main",
    name: "Advocate Pro",
    tagline: "Unlimited questions for practising advocates",
    pricePaiseMonth: 99900,
    pricePaiseYear: 999000,
    highlight: true,
    features: [
      "Unlimited standard AI questions (fair use)",
      "Citation checks on every answer",
      "All drafting templates, DOCX and PDF export",
      "Document review, summary and compare",
      "20 e-sign envelopes a month",
      "10 custom assistants",
      "200 heavy-task credits a month",
      "Daily legal updates and new-law alerts included",
    ],
    includes: ["legal_updates"],
    limits: {
      dailySoftCap: 150,
      dailyHardCap: 600,
      monthlyCredits: 200,
      modelTiers: ["fast", "standard", "pro"],
      esignEnvelopesPerMonth: 20,
      storageMb: 5000,
      customAssistants: 10,
    },
  },
  {
    id: "chambers",
    kind: "main",
    name: "Chambers",
    tagline: "For chambers and small firms (per seat)",
    pricePaiseMonth: 249900,
    pricePaiseYear: 2499000,
    perSeat: true,
    features: [
      "Everything in Advocate Pro",
      "Shared matters and templates",
      "Priority access to the strongest models",
      "100 e-sign envelopes a month per seat",
      "India-only processing option",
      "600 heavy-task credits a month per seat",
      "Daily legal updates and new-law alerts included",
    ],
    includes: ["legal_updates"],
    limits: {
      dailySoftCap: 300,
      dailyHardCap: 1200,
      monthlyCredits: 600,
      modelTiers: ["fast", "standard", "pro"],
      esignEnvelopesPerMonth: 100,
      storageMb: 25000,
      customAssistants: 50,
    },
  },
];

/**
 * Add-ons sit alongside the main plan. "Daily legal updates": the news and alerts feed
 * (bills, new laws, court and advocate news, pop-up alerts). Every account gets a free
 * trial first (UPDATES_TRIAL_DAYS); Advocate Pro and Chambers include it.
 * Bare-act amendments themselves are never behind a paywall.
 */
export const UPDATES_TRIAL_DAYS = 15;

export const addons: Plan[] = [
  {
    id: "updates",
    kind: "addon",
    name: "Daily legal updates",
    tagline: "Law, court and advocate news every day, with alerts for new laws",
    pricePaiseMonth: 14900,
    pricePaiseYear: 149000,
    features: [
      "Daily feed of bills, new acts, amendments and notifications",
      "Supreme Court, High Court and advocate news",
      "Pop-up alert when a law on BNS, IPC, BNSS, courts or procedure changes",
      "Alerts in the notifications bell",
      `First ${UPDATES_TRIAL_DAYS} days free`,
    ],
    includes: ["legal_updates"],
    // Add-ons do not change AI limits; these mirror the free plan and are unused.
    limits: {
      dailySoftCap: 15,
      dailyHardCap: 15,
      monthlyCredits: 0,
      modelTiers: ["fast", "standard"],
      esignEnvelopesPerMonth: 2,
      storageMb: 100,
      customAssistants: 1,
    },
  },
];

/** Every billable product, for seeding billing.plans and price lookups. */
export const allPlans: Plan[] = [...plans, ...addons];

export const planById = Object.fromEntries(allPlans.map((p) => [p.id, p])) as Record<PlanId, Plan>;

/** Catalogue lookup for an untrusted id (form input, DB text, query string). */
export function findPlan(id: unknown): Plan | undefined {
  return typeof id === "string" && Object.hasOwn(planById, id) ? planById[id as PlanId] : undefined;
}

export function isPlanId(id: unknown): id is PlanId {
  return findPlan(id) !== undefined;
}

/** A plan costs money when either price is above zero. */
export function planIsPaid(p: Plan): boolean {
  return p.pricePaiseMonth > 0 || p.pricePaiseYear > 0;
}

/** Plans that bundle a paid feature, in catalogue order. */
export function plansIncluding(feature: FeatureId): PlanId[] {
  return allPlans.filter((p) => p.includes.includes(feature)).map((p) => p.id);
}

/** Main plans replace each other (one at a time); they set the AI limits. */
export const MAIN_PLAN_IDS: PlanId[] = allPlans.filter((p) => p.kind === "main").map((p) => p.id);
/** Plans a user can pay for (price above zero for at least one interval). */
export const PAID_PLAN_IDS: PlanId[] = allPlans.filter(planIsPaid).map((p) => p.id);
/** Plans that include daily legal updates without the add-on. */
export const PLANS_WITH_UPDATES: PlanId[] = plansIncluding("legal_updates");

export const fairUsePolicy =
  "Unlimited means you are never cut off for normal legal work. After about 150 questions in a day, answers move to a faster model until the next day. Heavy tasks (long drafts, case bundles, bulk translation) use monthly credits. Automated scraping, reselling and account sharing are not allowed.";
