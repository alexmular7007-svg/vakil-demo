import { describe, expect, it } from "vitest";
import { chargeFor, isPaidPlan, planGroup } from "./pricing";
import { MAIN_PLAN_IDS, PLANS_WITH_UPDATES, UPDATES_TRIAL_DAYS, planById } from "@/lib/plans";

describe("plans and add-ons", () => {
  it("prices the updates add-on with 18% GST", () => {
    const m = chargeFor("updates", "month");
    expect(m.basePaise).toBe(planById.updates.pricePaiseMonth);
    expect(m.gstPaise).toBe(Math.round(m.basePaise * 0.18));
    expect(m.totalPaise).toBe(m.basePaise + m.gstPaise);
  });

  it("treats the add-on as paid but outside the main plan group", () => {
    expect(isPaidPlan("updates")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
    expect(planGroup("updates")).toEqual(["updates"]);
    expect(planGroup("pro")).toEqual(MAIN_PLAN_IDS);
    expect(MAIN_PLAN_IDS).not.toContain("updates");
  });

  it("includes updates in Pro and Chambers, with a 15-day trial", () => {
    expect(PLANS_WITH_UPDATES).toEqual(expect.arrayContaining(["pro", "chambers", "updates"]));
    expect(PLANS_WITH_UPDATES).not.toContain("free");
    expect(UPDATES_TRIAL_DAYS).toBe(15);
  });
});
