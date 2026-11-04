import { describe, expect, it } from "vitest";
import { GENESIS_HASH, computeEventHash, verifyChainRows, type ChainFields, type ChainRow } from "./chain";
import { maskEmail } from "./format";
import { hasUnsupportedChars, pdfSafe } from "./pdf";
import { checkSignerSessionValue } from "./signer-session";

const ENV = "11111111-1111-4111-8111-111111111111";

function build(fields: Omit<ChainFields, "envelopeId">[]): ChainRow[] {
  let prev = GENESIS_HASH;
  return fields.map((f, i) => {
    const full = { ...f, envelopeId: ENV };
    const hash = computeEventHash(prev, full);
    const row = { ...full, seq: i + 1, prevHash: prev, hash };
    prev = hash;
    return row;
  });
}

const sample: Omit<ChainFields, "envelopeId">[] = [
  { recipientId: null, type: "envelope.sent", documentSha256: "a".repeat(64), ip: "203.0.113.5", userAgent: "UA", data: { b: 2, a: 1 }, createdAt: new Date("2026-11-02T10:00:00.000Z") },
  { recipientId: "r1", type: "otp.verified", documentSha256: null, ip: "203.0.113.9", userAgent: "UA", data: null, createdAt: new Date("2026-11-02T10:05:00.000Z") },
  { recipientId: "r1", type: "recipient.signed", documentSha256: "a".repeat(64), ip: null, userAgent: null, data: { signatureKind: "typed" }, createdAt: new Date("2026-11-02T10:06:00.000Z") },
];

describe("event hash chain", () => {
  it("is deterministic and independent of JSON key order", () => {
    const f = { ...sample[0], envelopeId: ENV };
    expect(computeEventHash(GENESIS_HASH, f)).toBe(computeEventHash(GENESIS_HASH, { ...f, data: { a: 1, b: 2 } }));
    expect(computeEventHash(GENESIS_HASH, f)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies an intact chain and returns its head", () => {
    const rows = build(sample);
    const report = verifyChainRows(ENV, rows);
    expect(report.ok).toBe(true);
    expect(report.checked).toBe(3);
    expect(report.headHash).toBe(rows[2].hash);
  });

  it("detects an edited event", () => {
    const rows = build(sample);
    rows[1] = { ...rows[1], ip: "198.51.100.1" };
    const report = verifyChainRows(ENV, rows);
    expect(report.ok).toBe(false);
    expect(report.brokenAtSeq).toBe(2);
  });

  it("detects a removed event", () => {
    const rows = build(sample);
    const report = verifyChainRows(ENV, [rows[0], rows[2]]);
    expect(report.ok).toBe(false);
    expect(report.brokenAtSeq).toBe(3);
  });

  it("detects events from another envelope", () => {
    const rows = build(sample);
    const report = verifyChainRows("22222222-2222-4222-8222-222222222222", rows);
    expect(report.ok).toBe(false);
  });
});

describe("helpers", () => {
  it("masks emails", () => {
    expect(maskEmail("rahul.sharma@gmail.com")).toBe("r***a@g***.com");
    expect(maskEmail("ab@x.in")).toBe("a***@x***.in");
  });

  it("flags text standard PDF fonts cannot draw", () => {
    expect(hasUnsupportedChars("Agreement dated 2 Nov 2026 – ₹5,000 “paid”")).toBe(false);
    expect(hasUnsupportedChars("अनुबंध")).toBe(true);
    expect(pdfSafe("Fee ₹500")).toBe("Fee Rs. 500");
  });

  it("rejects forged or expired signer sessions", () => {
    expect(checkSignerSessionValue(undefined, "r1", "h")).toBe(false);
    expect(checkSignerSessionValue("r1.0.abc", "r1", "h")).toBe(false);
    expect(checkSignerSessionValue(`r1.${Date.now() + 60_000}.forged`, "r1", "h")).toBe(false);
  });
});
