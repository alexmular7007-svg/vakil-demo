import { describe, expect, it } from "vitest";
import { daysBetween, shiftDate } from "./days";

describe("days between two dates", () => {
  it("excludes the first day by default", () => {
    const r = daysBetween("2026-01-01", "2026-01-31");
    expect(r).toMatchObject({ ok: true, days: 30, weeks: 4, weekRemainder: 2, span: { years: 0, months: 0, days: 30 } });
  });

  it("can count both days", () => {
    const r = daysBetween("2026-01-01", "2026-01-31", { includeFirstDay: true });
    expect(r).toMatchObject({ ok: true, days: 31, span: { years: 0, months: 1, days: 0 } });
  });

  it("counts leap days", () => {
    expect(daysBetween("2024-02-01", "2024-03-01")).toMatchObject({ days: 29 });
    expect(daysBetween("2023-02-01", "2023-03-01")).toMatchObject({ days: 28 });
    expect(daysBetween("2020-01-01", "2030-01-01")).toMatchObject({ days: 3653, span: { years: 10, months: 0, days: 0 } });
  });

  it("swaps reversed dates and says so", () => {
    const r = daysBetween("2026-03-10", "2026-03-01");
    expect(r).toMatchObject({ ok: true, swapped: true, from: "2026-03-01", to: "2026-03-10", days: 9 });
    if (r.ok) expect(r.steps[0].title).toBe("Dates swapped");
  });

  it("the same date is zero days, or one counting both", () => {
    expect(daysBetween("2026-05-05", "2026-05-05")).toMatchObject({ days: 0 });
    expect(daysBetween("2026-05-05", "2026-05-05", { includeFirstDay: true })).toMatchObject({ days: 1 });
  });

  it("rejects invalid dates", () => {
    expect(daysBetween("2026-02-30", "2026-03-01")).toMatchObject({ ok: false });
    expect(daysBetween("", "2026-03-01")).toMatchObject({ ok: false });
  });
});

describe("adding to or subtracting from a date", () => {
  it("adds calendar days, excluding the given day", () => {
    expect(shiftDate("2026-01-31", 30, "days")).toMatchObject({ ok: true, result: "2026-03-02" });
    expect(shiftDate("2024-01-31", 30, "days")).toMatchObject({ ok: true, result: "2024-03-01" });
  });

  it("counting the given day as day one ends a day sooner", () => {
    expect(shiftDate("2026-01-31", 30, "days", { includeFirstDay: true })).toMatchObject({ result: "2026-03-01" });
    expect(shiftDate("2026-01-01", 1, "months", { includeFirstDay: true })).toMatchObject({ result: "2026-01-31" });
  });

  it("adds months and years on the corresponding date, clamping at month end", () => {
    expect(shiftDate("2026-01-31", 1, "months")).toMatchObject({ result: "2026-02-28", clamped: true });
    expect(shiftDate("2028-01-31", 1, "months")).toMatchObject({ result: "2028-02-29", clamped: true });
    expect(shiftDate("2026-01-15", 1, "months")).toMatchObject({ result: "2026-02-15", clamped: false });
    expect(shiftDate("2024-02-29", 1, "years")).toMatchObject({ result: "2025-02-28", clamped: true });
    expect(shiftDate("2024-02-29", 4, "years")).toMatchObject({ result: "2028-02-29", clamped: false });
  });

  it("subtracts", () => {
    expect(shiftDate("2026-03-05", 10, "days", { direction: "subtract" })).toMatchObject({ result: "2026-02-23" });
    expect(shiftDate("2026-03-31", 1, "months", { direction: "subtract" })).toMatchObject({ result: "2026-02-28", clamped: true });
    expect(shiftDate("2026-03-05", 10, "days", { direction: "subtract", includeFirstDay: true })).toMatchObject({ result: "2026-02-24" });
  });

  it("zero is a no-op", () => {
    expect(shiftDate("2026-03-05", 0, "days", { includeFirstDay: true })).toMatchObject({ result: "2026-03-05" });
  });

  it("rejects bad amounts and dates", () => {
    expect(shiftDate("2026-03-05", -1, "days")).toMatchObject({ ok: false });
    expect(shiftDate("2026-03-05", 1.5, "days")).toMatchObject({ ok: false });
    expect(shiftDate("2026-03-05", 101, "years")).toMatchObject({ ok: false });
    expect(shiftDate("2026-13-05", 1, "days")).toMatchObject({ ok: false });
  });
});
