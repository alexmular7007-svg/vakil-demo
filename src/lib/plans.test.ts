// Catalogue validation: the plan data and the paid-feature registry must stay
// consistent, because pricing, checkout, webhook activation, AI limits and paywalls
// are all derived from them.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAIN_PLAN_IDS,
  PAID_PLAN_IDS,
  PLANS_WITH_UPDATES,
  PLAN_IDS,
  addons,
  allPlans,
  findPlan,
  isPlanId,
  planById,
  plans,
  plansIncluding,
} from "./plans";
import { FEATURE_IDS, PAID_FEATURES, paidFeature } from "./billing/features";
import { PERMISSIONS } from "./auth/permissions";
import { BILLING_INTERVALS } from "./db/schema/enums";
import { chargeFor, isPaidPlan, isPurchasable, planGroup } from "./payments/pricing";

const ids = allPlans.map((p) => p.id);

describe("plan catalogue", () => {
  it("has unique ids, and every declared plan id has exactly one entry", () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...PLAN_IDS].sort());
    for (const id of PLAN_IDS) expect(planById[id].id).toBe(id);
  });

  it("seeds every plan id (scripts/seed.ts writes allPlans into billing.plans)", () => {
    const seed = readFileSync(path.resolve(import.meta.dirname, "../../scripts/seed.ts"), "utf8");
    expect(seed).toMatch(/import\s*\{[^}]*\ballPlans\b[^}]*\}\s*from\s*"@\/lib\/plans"/);
    // Every id that billing code can write into a payment or subscription is in allPlans.
    const referenced = new Set([...MAIN_PLAN_IDS, ...PAID_PLAN_IDS, ...PLANS_WITH_UPDATES, ...FEATURE_IDS.flatMap((f) => paidFeature(f).includedIn)]);
    for (const id of referenced) expect(ids).toContain(id);
  });

  it("has non-negative integer prices, and a year never costs more than 12 months", () => {
    for (const p of allPlans) {
      expect(Number.isInteger(p.pricePaiseMonth) && p.pricePaiseMonth >= 0, `${p.id} monthly`).toBe(true);
      expect(Number.isInteger(p.pricePaiseYear) && p.pricePaiseYear >= 0, `${p.id} yearly`).toBe(true);
      expect(p.pricePaiseYear, `${p.id} yearly <= 12 x monthly`).toBeLessThanOrEqual(12 * p.pricePaiseMonth);
      // A paid plan is paid for both intervals (no free year of a paid plan).
      expect(p.pricePaiseMonth > 0, `${p.id} prices agree`).toBe(p.pricePaiseYear > 0);
    }
  });

  it("keeps main plans and add-ons apart", () => {
    for (const p of plans) expect(p.kind, p.id).toBe("main");
    for (const a of addons) {
      expect(a.kind, a.id).toBe("addon");
      expect(MAIN_PLAN_IDS).not.toContain(a.id);
      expect(planGroup(a.id)).toEqual([a.id]);
      for (const m of MAIN_PLAN_IDS) expect(planGroup(m)).not.toContain(a.id);
    }
    expect(MAIN_PLAN_IDS).toEqual(plans.map((p) => p.id));
  });

  it("has exactly one free main plan, the AI-limits fallback", () => {
    const free = allPlans.filter((p) => !isPaidPlan(p.id));
    expect(free.map((p) => p.id)).toEqual(["free"]);
    expect(planById.free.kind).toBe("main");
    expect(isPurchasable("free", "month")).toBe(false);
  });

  it("derives the exported lists from the data, with the launch values", () => {
    expect(MAIN_PLAN_IDS).toEqual(["free", "pro", "chambers"]);
    expect(PAID_PLAN_IDS).toEqual(["pro", "chambers", "updates"]);
    expect(PLANS_WITH_UPDATES).toEqual(["pro", "chambers", "updates"]);
    expect(planGroup("pro")).toEqual(MAIN_PLAN_IDS);
    expect(planGroup("free")).toEqual(MAIN_PLAN_IDS);
    expect(planGroup("updates")).toEqual(["updates"]);
    for (const id of ids) expect(isPaidPlan(id)).toBe(PAID_PLAN_IDS.includes(id));
  });

  it("rejects unknown and prototype ids", () => {
    for (const bad of ["enterprise", "", "constructor", "__proto__", "toString"]) {
      expect(findPlan(bad), bad).toBeUndefined();
      expect(isPlanId(bad)).toBe(false);
      expect(isPaidPlan(bad)).toBe(false);
      expect(isPurchasable(bad, "month")).toBe(false);
      expect(planGroup(bad)).toEqual([]);
    }
    expect(isPurchasable("pro", "week")).toBe(false);
  });

  it("charges base + 18% GST (rounded) for every paid plan and interval", () => {
    for (const id of PAID_PLAN_IDS) {
      for (const interval of BILLING_INTERVALS) {
        const c = chargeFor(id, interval);
        expect(c.basePaise).toBe(interval === "year" ? planById[id].pricePaiseYear : planById[id].pricePaiseMonth);
        expect(c.gstPaise).toBe(Math.round(c.basePaise * 0.18));
        expect(c.totalPaise).toBe(c.basePaise + c.gstPaise);
        expect(Number.isInteger(c.totalPaise)).toBe(true);
        expect(isPurchasable(id, interval)).toBe(true);
      }
    }
  });

  it("has at most one highlighted plan", () => {
    expect(allPlans.filter((p) => p.highlight).length).toBeLessThanOrEqual(1);
  });
});

describe("paid-feature registry", () => {
  it("has sane trials and permissions", () => {
    for (const id of FEATURE_IDS) {
      const f = PAID_FEATURES[id];
      expect(Number.isInteger(f.trialDays) && f.trialDays >= 0, `${id} trialDays`).toBe(true);
      if (f.alwaysFor) expect(Object.keys(PERMISSIONS)).toContain(f.alwaysFor);
    }
  });

  it("makes every feature purchasable, and never gives one away on the free plan", () => {
    for (const id of FEATURE_IDS) {
      const f = paidFeature(id);
      expect(f.includedIn.length, `${id} is included in some plan`).toBeGreaterThan(0);
      for (const planId of f.includedIn) expect(isPaidPlan(planId), `${planId} includes ${id} but is free`).toBe(true);
    }
    for (const p of allPlans) if (!isPaidPlan(p.id)) expect(p.includes, p.id).toEqual([]);
  });

  it("points each feature's add-on at an add-on plan that includes it", () => {
    for (const id of FEATURE_IDS) {
      const addon = paidFeature(id).addon;
      if (!addon) continue;
      expect(planById[addon].kind).toBe("addon");
      expect(planById[addon].includes).toContain(id);
    }
  });

  it("only lists registered features in plan `includes`", () => {
    for (const p of allPlans) for (const f of p.includes) expect(FEATURE_IDS).toContain(f);
  });

  it("derives legal updates from the plans that include it", () => {
    expect(paidFeature("legal_updates").includedIn).toEqual(plansIncluding("legal_updates"));
    expect(paidFeature("legal_updates").includedIn).toEqual(PLANS_WITH_UPDATES);
    expect(paidFeature("legal_updates").trialDays).toBe(15);
    expect(paidFeature("legal_updates").alwaysFor).toBe("updates.always");
  });
});
