import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addPeriod,
  addYears,
  calendarSpan,
  closureReason,
  daysInMonth,
  diffDays,
  formatDay,
  formatDayLong,
  fromDayNumber,
  isIsoDate,
  isLeapYear,
  isSupportedDate,
  nextOpenDay,
  normaliseRanges,
  parseIsoDate,
  toDayNumber,
  todayInIndia,
  weekday,
  weekdayName,
} from "./dates";

describe("parsing", () => {
  it("accepts real calendar dates only", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2100-02-29")).toBe(false); // century, not divisible by 400
    expect(isIsoDate("2000-02-29")).toBe(true);
    expect(isIsoDate("2025-13-01")).toBe(false);
    expect(isIsoDate("2025-04-31")).toBe(false);
    expect(isIsoDate("2025-1-01")).toBe(false);
    expect(isIsoDate("01-01-2025")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
    expect(parseIsoDate("2026-11-03")).toEqual({ y: 2026, m: 11, d: 3 });
  });

  it("limits the supported range", () => {
    expect(isSupportedDate("1899-12-31")).toBe(false);
    expect(isSupportedDate("1900-01-01")).toBe(true);
    expect(isSupportedDate("2200-12-31")).toBe(true);
    expect(isSupportedDate("2201-01-01")).toBe(false);
  });

  it("knows leap years and month lengths", () => {
    expect([1900, 2000, 2023, 2024, 2100].map(isLeapYear)).toEqual([false, true, false, true, false]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 12)).toBe(31);
  });

  it("round-trips day numbers without time-zone drift", () => {
    for (const d of ["1900-01-01", "1969-12-31", "1970-01-01", "2024-02-29", "2026-11-03", "2200-12-31"]) {
      expect(fromDayNumber(toDayNumber(d))).toBe(d);
    }
    expect(toDayNumber("1970-01-02")).toBe(1);
  });
});

describe("adding days", () => {
  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-01-01", 30)).toBe("2026-01-31");
  });

  it("counts days between dates", () => {
    expect(diffDays("2024-01-01", "2025-01-01")).toBe(366);
    expect(diffDays("2025-01-01", "2026-01-01")).toBe(365);
    expect(diffDays("2026-01-31", "2026-01-01")).toBe(-30);
  });
});

describe("adding months and years (British calendar, corresponding date)", () => {
  it("lands on the corresponding date", () => {
    expect(addMonths("2025-12-15", 1)).toEqual({ date: "2026-01-15", clamped: false });
    expect(addMonths("1995-10-15", 1)).toEqual({ date: "1995-11-15", clamped: false });
    expect(addMonths("2026-01-15", 3)).toEqual({ date: "2026-04-15", clamped: false });
  });

  it("clamps 31 January + 1 month to the end of February", () => {
    expect(addMonths("2025-01-31", 1)).toEqual({ date: "2025-02-28", clamped: true });
    expect(addMonths("2024-01-31", 1)).toEqual({ date: "2024-02-29", clamped: true });
    expect(addMonths("2024-01-30", 1)).toEqual({ date: "2024-02-29", clamped: true });
    expect(addMonths("2024-01-29", 1)).toEqual({ date: "2024-02-29", clamped: false });
  });

  it("clamps other short months and works backwards", () => {
    expect(addMonths("2025-08-31", 6).date).toBe("2026-02-28");
    expect(addMonths("2025-03-31", 1)).toEqual({ date: "2025-04-30", clamped: true });
    expect(addMonths("2025-03-31", -1)).toEqual({ date: "2025-02-28", clamped: true });
    expect(addMonths("2025-01-15", -2).date).toBe("2024-11-15");
    expect(addMonths("2025-01-15", 0).date).toBe("2025-01-15");
  });

  it("does not drift when anchored to the start date", () => {
    // 31 Jan + 2 months is 31 Mar, not 28 Mar.
    expect(addMonths("2025-01-31", 2).date).toBe("2025-03-31");
  });

  it("handles 29 February in year arithmetic", () => {
    expect(addYears("2024-02-29", 1)).toEqual({ date: "2025-02-28", clamped: true });
    expect(addYears("2024-02-29", 4)).toEqual({ date: "2028-02-29", clamped: false });
    expect(addYears("2023-03-10", 3)).toEqual({ date: "2026-03-10", clamped: false });
  });

  it("adds periods in any unit", () => {
    expect(addPeriod("2026-01-01", { amount: 30, unit: "days" }).date).toBe("2026-01-31");
    expect(addPeriod("2026-01-01", { amount: 1, unit: "months" }).date).toBe("2026-02-01");
    expect(addPeriod("2014-06-30", { amount: 12, unit: "years" }).date).toBe("2026-06-30");
  });
});

describe("weekdays and formatting", () => {
  it("knows the day of the week", () => {
    expect(weekday("1970-01-01")).toBe(4); // Thursday
    expect(weekdayName("2026-11-03")).toBe("Tuesday");
    expect(weekdayName("2026-01-31")).toBe("Saturday");
    expect(weekdayName("1900-01-01")).toBe("Monday");
  });

  it("formats dates the same everywhere", () => {
    expect(formatDay("2026-01-05")).toBe("5 Jan 2026");
    expect(formatDayLong("2026-11-03")).toBe("Tue, 3 Nov 2026");
  });

  it("reads today in IST, not UTC", () => {
    expect(todayInIndia(new Date("2026-11-03T18:00:00Z"))).toBe("2026-11-03"); // 11:30 pm IST
    expect(todayInIndia(new Date("2026-11-03T18:30:00Z"))).toBe("2026-11-04"); // midnight IST
    expect(todayInIndia(new Date("2026-12-31T19:00:00Z"))).toBe("2027-01-01");
  });
});

describe("calendar span", () => {
  it("splits into years, months and days", () => {
    expect(calendarSpan("2020-01-15", "2026-03-20")).toEqual({ years: 6, months: 2, days: 5 });
    expect(calendarSpan("2026-01-01", "2026-01-31")).toEqual({ years: 0, months: 0, days: 30 });
    expect(calendarSpan("2026-01-01", "2026-02-01")).toEqual({ years: 0, months: 1, days: 0 });
    expect(calendarSpan("2024-01-31", "2024-02-29")).toEqual({ years: 0, months: 1, days: 0 });
    expect(calendarSpan("2024-01-31", "2024-02-28")).toEqual({ years: 0, months: 0, days: 28 });
    expect(calendarSpan("2020-02-29", "2021-02-28")).toEqual({ years: 1, months: 0, days: 0 });
    expect(calendarSpan("2026-05-05", "2026-05-05")).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("rejects a reversed range", () => {
    expect(() => calendarSpan("2026-02-01", "2026-01-01")).toThrow();
  });
});

describe("court closures (s. 4)", () => {
  const closures = { sundays: true, saturdays: false, ranges: normaliseRanges([{ from: "2026-06-10", to: "2026-06-01" }, { from: "2026-08-15" }, { from: "bad" }]) };

  it("normalises ranges", () => {
    expect(closures.ranges).toEqual([
      { from: "2026-06-01", to: "2026-06-10" },
      { from: "2026-08-15", to: "2026-08-15" },
    ]);
  });

  it("names the reason for a closure", () => {
    expect(closureReason("2026-11-08", closures)).toBe("Sunday");
    expect(closureReason("2026-11-07", closures)).toBeNull(); // Saturday open
    expect(closureReason("2026-06-03", closures)).toMatch(/closure from 1 Jun 2026 to 10 Jun 2026/);
    expect(closureReason("2026-08-15", closures)).toBe("closure on 15 Aug 2026");
  });

  it("finds the next open day", () => {
    expect(nextOpenDay("2026-11-09", closures)).toEqual({ date: "2026-11-09", skipped: [] }); // Monday
    const r = nextOpenDay("2026-06-05", closures)!;
    expect(r.date).toBe("2026-06-11");
    expect(r.skipped).toHaveLength(6); // 5 to 10 June
    expect(nextOpenDay("2026-01-01", { sundays: false, saturdays: false, ranges: [{ from: "2026-01-01", to: "2030-01-01" }] })).toBeNull();
  });
});
