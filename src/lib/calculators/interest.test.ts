import { describe, expect, it } from "vitest";
import { computeInterest, formatRupees, roundPaise, type InterestInput } from "./interest";

function ok(input: InterestInput) {
  const r = computeInterest(input);
  if (!r.ok) throw new Error(`Expected a result, got errors: ${r.errors.join(" ")}`);
  return r;
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("simple interest (Actual/365)", () => {
  it("one ordinary year at 12% on ₹1,00,000", () => {
    const r = ok({ principal: 100000, ratePercent: 12, from: "2025-01-01", to: "2026-01-01", method: "simple" });
    expect(r.days).toBe(365);
    expect(r.interest).toBeCloseTo(12000, 6);
    expect(r.amount).toBeCloseTo(112000, 6);
    expect(r.perDay).toBeCloseTo(32.876712, 5);
  });

  it("a leap year has 366 days of interest", () => {
    const r = ok({ principal: 100000, ratePercent: 12, from: "2024-01-01", to: "2025-01-01", method: "simple" });
    expect(r.days).toBe(366);
    expect(roundPaise(r.interest)).toBe(12032.88);
  });

  it("breaks the period into years whose rows add up to the total", () => {
    const r = ok({ principal: 250000, ratePercent: 9, from: "2024-01-01", to: "2026-03-01", method: "simple" });
    expect(r.rows.map((x) => [x.from, x.to, x.days, x.part])).toEqual([
      ["2024-01-01", "2025-01-01", 366, false],
      ["2025-01-01", "2026-01-01", 365, false],
      ["2026-01-01", "2026-03-01", 59, true],
    ]);
    expect(sum(r.rows.map((x) => x.interest))).toBeCloseTo(r.interest, 8);
    expect(r.rows.at(-1)!.closing).toBeCloseTo(r.amount, 8);
    expect(r.days).toBe(790);
  });

  it("a short period", () => {
    const r = ok({ principal: "1,00,000", ratePercent: "18", from: "2026-01-01", to: "2026-01-31", method: "simple" });
    expect(r.days).toBe(30);
    expect(roundPaise(r.interest)).toBe(1479.45);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].part).toBe(true);
  });
});

describe("compound interest", () => {
  it("annual rests over whole years", () => {
    const r = ok({ principal: 100000, ratePercent: 10, from: "2020-01-01", to: "2023-01-01", method: "compound", compounding: "annually" });
    expect(r.amount).toBeCloseTo(133100, 6);
    expect(r.rows).toHaveLength(3);
    expect(r.rows.every((x) => !x.part)).toBe(true);
    expect(r.effectiveRate).toBeCloseTo(10, 10);
  });

  it("quarterly rests over one year", () => {
    const r = ok({ principal: 100000, ratePercent: 8, from: "2025-04-01", to: "2026-04-01", method: "compound", compounding: "quarterly" });
    expect(r.amount).toBeCloseTo(100000 * 1.02 ** 4, 6);
    expect(roundPaise(r.interest)).toBe(8243.22);
    expect(r.effectiveRate).toBeCloseTo(8.243216, 6);
    expect(r.rows.map((x) => x.to)).toEqual(["2025-07-01", "2025-10-01", "2026-01-01", "2026-04-01"]);
  });

  it("monthly rests over one year", () => {
    const r = ok({ principal: 100000, ratePercent: 12, from: "2025-01-01", to: "2026-01-01", method: "compound", compounding: "monthly" });
    expect(r.rows).toHaveLength(12);
    expect(r.amount).toBeCloseTo(100000 * 1.01 ** 12, 6);
    expect(roundPaise(r.amount)).toBe(112682.5);
  });

  it("adds simple interest for a broken last period", () => {
    const r = ok({ principal: 100000, ratePercent: 12, from: "2025-01-01", to: "2026-07-01", method: "compound", compounding: "annually" });
    expect(r.rows).toHaveLength(2);
    const last = r.rows[1];
    expect(last).toMatchObject({ from: "2026-01-01", to: "2026-07-01", days: 181, part: true });
    expect(last.opening).toBeCloseTo(112000, 6);
    expect(last.interest).toBeCloseTo((112000 * 0.12 * 181) / 365, 8);
    expect(roundPaise(r.amount)).toBe(118664.77);
  });

  it("anchors month-end periods to the start date (31 Jan, 28 Feb, 31 Mar)", () => {
    const r = ok({ principal: 50000, ratePercent: 12, from: "2025-01-31", to: "2025-04-30", method: "compound", compounding: "monthly" });
    expect(r.rows.map((x) => x.to)).toEqual(["2025-02-28", "2025-03-31", "2025-04-30"]);
    expect(r.rows.every((x) => !x.part)).toBe(true);
  });

  it("a period shorter than one rest is all broken period", () => {
    const r = ok({ principal: 100000, ratePercent: 12, from: "2026-01-01", to: "2026-02-15", method: "compound", compounding: "quarterly" });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].part).toBe(true);
    expect(r.interest).toBeCloseTo((100000 * 0.12 * 45) / 365, 8);
  });

  it("compounding beats simple interest over the same span", () => {
    const input = { principal: 100000, ratePercent: 10, from: "2020-01-01", to: "2025-01-01" } as const;
    const s = ok({ ...input, method: "simple" });
    const c = ok({ ...input, method: "compound", compounding: "annually" });
    expect(c.interest).toBeGreaterThan(s.interest);
  });
});

describe("validation and formatting", () => {
  const base = { principal: 1000, ratePercent: 10, from: "2025-01-01", to: "2026-01-01", method: "simple" as const };
  it("rejects bad input", () => {
    expect(computeInterest({ ...base, principal: 0 })).toMatchObject({ ok: false });
    expect(computeInterest({ ...base, principal: "abc" })).toMatchObject({ ok: false });
    expect(computeInterest({ ...base, ratePercent: 0 })).toMatchObject({ ok: false });
    expect(computeInterest({ ...base, ratePercent: 101 })).toMatchObject({ ok: false });
    expect(computeInterest({ ...base, to: "2025-01-01" })).toMatchObject({ ok: false });
    expect(computeInterest({ ...base, to: "2024-01-01" })).toMatchObject({ ok: false });
    expect(computeInterest({ ...base, to: "2126-01-02" })).toMatchObject({ ok: false });
    expect(computeInterest({ ...base, from: "2025-02-29" })).toMatchObject({ ok: false });
  });

  it("formats rupees in the Indian system", () => {
    expect(formatRupees(1234567.891)).toBe("₹12,34,567.89");
    expect(formatRupees(0.006)).toBe("₹0.01");
    expect(formatRupees(100)).toBe("₹100.00");
  });

  it("describes s. 34 CPC without asserting a rate", () => {
    const n = ok(base).notes.find((x) => x.title.includes("s. 34"))!;
    expect(n.body).not.toMatch(/\d+\s*(%|per cent)/);
  });
});
