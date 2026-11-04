import { describe, expect, it } from "vitest";
import {
  addDays,
  compareHearings,
  daysBetween,
  formatDayDate,
  formatTime,
  formatYmd,
  groupByDate,
  isHhmm,
  isYmd,
  istInstant,
  itemNumber,
  parseIndianDate,
  rangeLabel,
  relativeDay,
  startOfWeek,
  todayIST,
  weekDays,
} from "./dates";

describe("isYmd / isHhmm", () => {
  it("accepts real dates only", () => {
    expect(isYmd("2026-11-03")).toBe(true);
    expect(isYmd("2028-02-29")).toBe(true);
    expect(isYmd("2026-02-29")).toBe(false);
    expect(isYmd("2026-13-01")).toBe(false);
    expect(isYmd("03-11-2026")).toBe(false);
    expect(isYmd("")).toBe(false);
    expect(isYmd(undefined)).toBe(false);
  });
  it("accepts 24-hour HH:MM", () => {
    expect(isHhmm("10:30")).toBe(true);
    expect(isHhmm("23:59")).toBe(true);
    expect(isHhmm("24:00")).toBe(false);
    expect(isHhmm("9:30")).toBe(false);
    expect(isHhmm(null)).toBe(false);
  });
});

describe("todayIST", () => {
  it("rolls over at IST midnight, not UTC midnight", () => {
    // 18:29 UTC on 3 Nov = 23:59 IST on 3 Nov
    expect(todayIST(new Date("2026-11-03T18:29:00Z"))).toBe("2026-11-03");
    // 18:30 UTC on 3 Nov = 00:00 IST on 4 Nov
    expect(todayIST(new Date("2026-11-03T18:30:00Z"))).toBe("2026-11-04");
  });
});

describe("date arithmetic", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-03", "2026-12-03")).toBe(30);
  });
  it("starts weeks on Monday", () => {
    // 3 Nov 2026 is a Tuesday
    expect(startOfWeek("2026-11-03")).toBe("2026-11-02");
    expect(startOfWeek("2026-11-08")).toBe("2026-11-02"); // Sunday belongs to the week before
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
    expect(weekDays("2026-11-03")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });
  it("labels relative days", () => {
    expect(relativeDay("2026-11-03", "2026-11-03")).toBe("Today");
    expect(relativeDay("2026-11-04", "2026-11-03")).toBe("Tomorrow");
    expect(relativeDay("2026-11-02", "2026-11-03")).toBe("Yesterday");
    expect(relativeDay("2026-11-10", "2026-11-03")).toBeNull();
  });
  it("labels week ranges", () => {
    expect(rangeLabel("2026-11-02", "2026-11-08")).toBe("November 2026");
    expect(rangeLabel("2026-11-30", "2026-12-06")).toMatch(/^Nov – Dec 2026$/);
    expect(rangeLabel("2026-12-28", "2027-01-03")).toMatch(/^Dec 2026 – Jan 2027$/);
  });
});

describe("formatting", () => {
  it("formats calendar dates without timezone drift", () => {
    expect(formatYmd("2026-11-04", { day: "numeric", month: "short", year: "numeric" })).toBe("4 Nov 2026");
    expect(formatYmd("2026-11-17")).toBe("17 Nov 2026");
    expect(formatDayDate("2026-11-17")).toBe("Tue, 17 Nov 2026");
    expect(formatYmd("not a date")).toBe("—");
  });
  it("formats 12-hour times", () => {
    expect(formatTime("10:30")).toBe("10:30 am");
    expect(formatTime("00:05")).toBe("12:05 am");
    expect(formatTime("12:00")).toBe("12:00 pm");
    expect(formatTime("14:15")).toBe("2:15 pm");
    expect(formatTime(null)).toBeNull();
  });
  it("converts IST wall-clock to a UTC instant", () => {
    expect(istInstant("2026-11-04", "10:30")).toBe("2026-11-04T05:00:00.000Z");
    expect(istInstant("2026-11-04")).toBe("2026-11-03T18:30:00.000Z");
  });
});

describe("parseIndianDate", () => {
  it("reads day-first dates", () => {
    expect(parseIndianDate("15.12.2026")).toBe("2026-12-15");
    expect(parseIndianDate("5/1/2027")).toBe("2027-01-05");
    expect(parseIndianDate("05-01-27")).toBe("2027-01-05");
    expect(parseIndianDate("2026-12-15")).toBe("2026-12-15");
    expect(parseIndianDate("31.02.2026")).toBeNull();
    expect(parseIndianDate("next week")).toBeNull();
    expect(parseIndianDate(null)).toBeNull();
  });
});

describe("ordering", () => {
  const h = (hearingDate: string, hearingTime: string | null, itemNo: string | null, caseTitle = "A") => ({ hearingDate, hearingTime, itemNo, caseTitle });
  it("sorts by date, time (untimed last), then item number", () => {
    const list = [
      h("2026-11-04", null, "3", "untimed"),
      h("2026-11-04", "14:00", "1", "afternoon"),
      h("2026-11-04", "10:30", "22", "item 22"),
      h("2026-11-04", "10:30", "S-4", "item 4"),
      h("2026-11-03", null, null, "yesterday"),
    ].sort(compareHearings);
    expect(list.map((x) => x.caseTitle)).toEqual(["yesterday", "item 4", "item 22", "afternoon", "untimed"]);
  });
  it("parses item numbers", () => {
    expect(itemNumber("14")).toBe(14);
    expect(itemNumber("S-14A")).toBe(14);
    expect(itemNumber("Supp")).toBeNull();
    expect(itemNumber(null)).toBeNull();
  });
  it("groups consecutive dates", () => {
    const g = groupByDate([h("2026-11-04", null, null), h("2026-11-04", null, null), h("2026-11-05", null, null)]);
    expect(g.map((x) => [x.date, x.items.length])).toEqual([
      ["2026-11-04", 2],
      ["2026-11-05", 1],
    ]);
  });
});
