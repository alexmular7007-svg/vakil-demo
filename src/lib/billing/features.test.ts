import { describe, expect, it } from "vitest";
import { hasFeature, isFeatureId, resolveFeatureAccess, trialDaysLeft, trialEndsAt } from "./features";

const now = new Date("2026-11-03T10:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);
const DAY = 86_400_000;

describe("resolveFeatureAccess", () => {
  it("always grants staff access, without an end date", () => {
    const a = resolveFeatureAccess({ always: true, subscription: null, trialEndsAt: at(-DAY), now });
    expect(a).toEqual({ status: "paid", via: "admin", until: null });
    expect(hasFeature(a)).toBe(true);
  });

  it("grants access through a plan until exactly its period end", () => {
    const live = resolveFeatureAccess({ always: false, subscription: { planId: "pro", periodEnd: at(1) }, trialEndsAt: null, now });
    expect(live).toEqual({ status: "paid", via: "pro", until: at(1) });
    const ended = resolveFeatureAccess({ always: false, subscription: { planId: "pro", periodEnd: now }, trialEndsAt: null, now });
    expect(ended).toEqual({ status: "locked" });
    expect(hasFeature(ended)).toBe(false);
  });

  it("falls back to the trial, then to expired", () => {
    const trial = resolveFeatureAccess({ always: false, subscription: null, trialEndsAt: at(15 * DAY), now });
    expect(trial).toEqual({ status: "trial", trialEndsAt: at(15 * DAY), daysLeft: 15 });
    expect(hasFeature(trial)).toBe(true);
    const expired = resolveFeatureAccess({ always: false, subscription: null, trialEndsAt: now, now });
    expect(expired).toEqual({ status: "expired", trialEndedAt: now });
    expect(hasFeature(expired)).toBe(false);
  });

  it("locks a feature without a trial or plan", () => {
    expect(resolveFeatureAccess({ always: false, subscription: null, trialEndsAt: null, now })).toEqual({ status: "locked" });
  });
});

describe("trial helpers", () => {
  it("counts whole days left, at least one while running", () => {
    expect(trialDaysLeft(at(DAY * 14 + 1), now)).toBe(15);
    expect(trialDaysLeft(at(DAY), now)).toBe(1);
    expect(trialDaysLeft(at(60_000), now)).toBe(1);
    expect(trialEndsAt(now, 15).getTime() - now.getTime()).toBe(15 * DAY);
  });

  it("recognises registered features only", () => {
    expect(isFeatureId("legal_updates")).toBe(true);
    expect(isFeatureId("constructor")).toBe(false);
    expect(isFeatureId("anything")).toBe(false);
  });
});
