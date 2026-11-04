import { describe, expect, it } from "vitest";
import { computeInvoiceTotals, formatRateBp, paiseToInputValue, parseRupeesToPaise, rupeesInWords } from "./money";

describe("rupeesInWords (Indian numbering)", () => {
  it("writes lakh and crore", () => {
    expect(rupeesInWords(1_20_000_00)).toBe("Rupees One Lakh Twenty Thousand only");
    expect(rupeesInWords(1_00_00_000_00)).toBe("Rupees One Crore only");
    expect(rupeesInWords(12_34_56_789_00)).toBe("Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine only");
    expect(rupeesInWords(250_00_00_000_00)).toBe("Rupees Two Hundred Fifty Crore only");
  });

  it("handles paise", () => {
    expect(rupeesInWords(1_50_000_50)).toBe("Rupees One Lakh Fifty Thousand and Fifty Paise only");
    expect(rupeesInWords(101_05)).toBe("Rupees One Hundred One and Five Paise only");
    expect(rupeesInWords(75)).toBe("Seventy Five Paise only");
  });

  it("handles small and zero amounts", () => {
    expect(rupeesInWords(0)).toBe("Rupees Zero only");
    expect(rupeesInWords(1_00)).toBe("Rupees One only");
    expect(rupeesInWords(11_000_00)).toBe("Rupees Eleven Thousand only");
    expect(rupeesInWords(99_999_00)).toBe("Rupees Ninety Nine Thousand Nine Hundred Ninety Nine only");
  });

  it("rejects negative input", () => {
    expect(rupeesInWords(-5)).toBe("");
  });
});

describe("parseRupeesToPaise", () => {
  it("accepts Indian and plain grouping, rupee sign and decimals", () => {
    expect(parseRupeesToPaise("1,20,000")).toBe(1_20_000_00);
    expect(parseRupeesToPaise("₹ 4500.5")).toBe(4500_50);
    expect(parseRupeesToPaise("99.99")).toBe(99_99);
    expect(parseRupeesToPaise("Rs. 250")).toBe(250_00);
    expect(parseRupeesToPaise("0")).toBe(0);
  });

  it("rejects malformed amounts", () => {
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("12.345")).toBeNull();
    expect(parseRupeesToPaise("-10")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(parseRupeesToPaise("1e5")).toBeNull();
  });

  it("round-trips through the input format", () => {
    for (const p of [0, 5, 1_00, 1_20_000_00, 4500_50, 99_99]) {
      expect(parseRupeesToPaise(paiseToInputValue(p))).toBe(p);
    }
  });
});

describe("computeInvoiceTotals", () => {
  const items = [50_000_00, 25_000_00, 1_50];

  it("adds nothing when there is no GST", () => {
    expect(computeInvoiceTotals(items, "none")).toEqual({ subtotalPaise: 75_001_50, taxPaise: 0, totalPaise: 75_001_50, gstRateBp: 0 });
  });

  it("adds nothing under reverse charge (the recipient pays GST)", () => {
    expect(computeInvoiceTotals(items, "reverse_charge", 1800)).toEqual({ subtotalPaise: 75_001_50, taxPaise: 0, totalPaise: 75_001_50, gstRateBp: 0 });
  });

  it("adds GST at the chosen rate under forward charge, rounded to the paisa", () => {
    expect(computeInvoiceTotals([1_00_000_00], "forward")).toEqual({ subtotalPaise: 1_00_000_00, taxPaise: 18_000_00, totalPaise: 1_18_000_00, gstRateBp: 1800 });
    // 18% of ₹75,001.50 = ₹13,500.27
    expect(computeInvoiceTotals(items, "forward", 1800)).toEqual({ subtotalPaise: 75_001_50, taxPaise: 13_500_27, totalPaise: 88_501_77, gstRateBp: 1800 });
    expect(computeInvoiceTotals([333], "forward", 1800).taxPaise).toBe(60); // 59.94 → 60
  });

  it("formats rates", () => {
    expect(formatRateBp(1800)).toBe("18%");
    expect(formatRateBp(1250)).toBe("12.5%");
  });
});
