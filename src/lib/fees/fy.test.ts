import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  financialYearOf,
  formatInvoiceNumber,
  isIsoDate,
  istToday,
  nextInvoiceSeq,
  normalizeInvoicePrefix,
  parseInvoiceSeq,
  INVOICE_PREFIX_RE,
} from "./fy";

describe("financial year", () => {
  it("runs April to March", () => {
    expect(financialYearOf("2026-11-03")).toEqual({ label: "2026-27", start: "2026-04-01", end: "2027-03-31", startYear: 2026 });
    expect(financialYearOf("2027-03-31").label).toBe("2026-27");
    expect(financialYearOf("2027-04-01").label).toBe("2027-28");
    expect(financialYearOf("2026-01-15").label).toBe("2025-26");
    expect(financialYearOf("2099-12-01").label).toBe("2099-00");
  });

  it("uses India time for today", () => {
    // 20:00 UTC on 31 March is 01:30 IST on 1 April.
    expect(istToday(new Date("2027-03-31T20:00:00Z"))).toBe("2027-04-01");
    expect(istToday(new Date("2026-11-03T05:00:00Z"))).toBe("2026-11-03");
  });

  it("does date arithmetic", () => {
    expect(addDays("2026-03-25", 15)).toBe("2026-04-09");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2026-10-01", "2026-11-03")).toBe(33);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("28-02-2026")).toBe(false);
  });
});

describe("invoice numbers", () => {
  it("formats PREFIX/FY/NNNN", () => {
    expect(formatInvoiceNumber("INV", "2026-27", 1)).toBe("INV/2026-27/0001");
    expect(formatInvoiceNumber("SHARMA-LAW", "2026-27", 123)).toBe("SHARMA-LAW/2026-27/0123");
    expect(formatInvoiceNumber("INV", "2026-27", 12345)).toBe("INV/2026-27/12345");
    expect(() => formatInvoiceNumber("INV", "2026-27", 0)).toThrow();
  });

  it("parses the sequence back", () => {
    expect(parseInvoiceSeq("INV/2026-27/0042")).toBe(42);
    expect(parseInvoiceSeq("odd")).toBeNull();
  });

  it("continues the series per financial year across prefixes", () => {
    const used = ["INV/2025-26/0040", "INV/2026-27/0001", "INV/2026-27/0002", "FEE/2026-27/0007"];
    expect(nextInvoiceSeq(used, "2026-27")).toBe(8);
    expect(nextInvoiceSeq(used, "2025-26")).toBe(41);
    expect(nextInvoiceSeq(used, "2027-28")).toBe(1);
    expect(nextInvoiceSeq([], "2026-27")).toBe(1);
  });

  it("normalizes prefixes", () => {
    expect(normalizeInvoicePrefix(" adv/sk ")).toBe("ADVSK");
    expect(INVOICE_PREFIX_RE.test("INV")).toBe(true);
    expect(INVOICE_PREFIX_RE.test("SHARMA-LAW")).toBe(true);
    expect(INVOICE_PREFIX_RE.test("-INV")).toBe(false);
    expect(INVOICE_PREFIX_RE.test("")).toBe(false);
  });
});
