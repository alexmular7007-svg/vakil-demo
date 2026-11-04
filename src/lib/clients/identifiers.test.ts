import { describe, expect, it } from "vitest";
import { escapeLike, gstinCheckChar, isValidCnr, isValidGstin, isValidPhone, normalizeCnr, normalizeGstin, normalizePhone } from "./identifiers";

describe("GSTIN", () => {
  it("accepts well-formed GSTINs with a correct check character", () => {
    // Sample GSTIN used in GST portal documentation.
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin(normalizeGstin(" 27aapfu0939f1zv "))).toBe(true);
  });

  it("rejects a wrong check character", () => {
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false);
  });

  it("rejects malformed values", () => {
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false); // 14 chars
    expect(isValidGstin("27AAPFU0939F1XV")).toBe(false); // 14th char must be Z
    expect(isValidGstin("2AAAPFU0939F1ZV")).toBe(false);
    expect(isValidGstin("27AAPF10939F1ZV")).toBe(false);
  });

  it("computes the check character", () => {
    expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V");
  });
});

describe("CNR", () => {
  it("accepts 16 letters and digits after normalising", () => {
    expect(normalizeCnr("dlhc01-001234 2024")).toBe("DLHC010012342024");
    expect(isValidCnr("DLHC010012342024")).toBe(true);
    expect(isValidCnr(normalizeCnr("mhau010012342023"))).toBe(true);
  });

  it("rejects other lengths and symbols", () => {
    expect(isValidCnr("DLHC01001234202")).toBe(false);
    expect(isValidCnr("DLHC0100123420245")).toBe(false);
    expect(isValidCnr("DLHC01001234202/")).toBe(false);
    expect(isValidCnr("dlhc010012342024")).toBe(false);
  });
});

describe("phone and LIKE escaping", () => {
  it("normalises phone numbers", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("+919876543210");
    expect(isValidPhone("9876543210")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
  });

  it("escapes wildcards", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});
