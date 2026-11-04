import { describe, expect, it } from "vitest";
import { buildUpiLink, isValidVpa, normalizeVpa } from "./upi";

describe("UPI links", () => {
  it("builds a pay intent with rupees and two decimals", () => {
    expect(buildUpiLink({ vpa: "adv.sharma@okhdfcbank", name: "Adv. R Sharma", amountPaise: 1_20_000_00, note: "INV/2026-27/0001" })).toBe(
      "upi://pay?pa=adv.sharma@okhdfcbank&pn=Adv.%20R%20Sharma&am=120000.00&cu=INR&tn=INV%2F2026-27%2F0001",
    );
    expect(buildUpiLink({ vpa: "a1@upi", name: "A & B Associates", amountPaise: 4505 })).toBe("upi://pay?pa=a1@upi&pn=A%20%26%20B%20Associates&am=45.05&cu=INR");
  });

  it("falls back to the VPA when no name is given", () => {
    expect(buildUpiLink({ vpa: "ab@ybl", name: " ", amountPaise: 100 })).toBe("upi://pay?pa=ab@ybl&pn=ab@ybl&am=1.00&cu=INR");
  });

  it("refuses invalid input", () => {
    expect(() => buildUpiLink({ vpa: "not a vpa", name: "X", amountPaise: 100 })).toThrow();
    expect(() => buildUpiLink({ vpa: "ab@ybl", name: "X", amountPaise: 0 })).toThrow();
    expect(() => buildUpiLink({ vpa: "ab@ybl", name: "X", amountPaise: 10.5 })).toThrow();
  });

  it("validates UPI IDs", () => {
    expect(isValidVpa(normalizeVpa(" Adv.Sharma@OKHDFCBANK "))).toBe(true);
    expect(isValidVpa("9876543210@paytm")).toBe(true);
    expect(isValidVpa("name@")).toBe(false);
    expect(isValidVpa("@bank")).toBe(false);
    expect(isValidVpa("a@b")).toBe(false);
    expect(isValidVpa("name@bank@x")).toBe(false);
  });
});
