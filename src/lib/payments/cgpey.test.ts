// CGPEY callback verification and parsing. Pure: no network, no real keys.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WEBHOOK_TOLERANCE_SECONDS, parseWebhook, parseWebhookTimestamp, verifyCgpeySignature } from "./cgpey";

const SECRET = "test-webhook-secret";
const now = new Date("2026-11-03T10:00:00Z");
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body, "utf8").digest("hex");
const body = JSON.stringify({ status: "SUCCESS", order_id: "VAKTEST123", message: "ok", utr: "UTR1", amount: "1178.82", date: "2026-11-03" });
const headers = (h: Record<string, string>) => new Headers(h);

describe("verifyCgpeySignature", () => {
  it("accepts the HMAC-SHA256 hex of the raw body, in either case", () => {
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sign(body) }), SECRET, now)).toBe(true);
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sign(body).toUpperCase() }), SECRET, now)).toBe(true);
  });

  it("accepts the compact JSON form when a proxy re-serialised whitespace", () => {
    const spaced = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyCgpeySignature(spaced, headers({ "x-webhook-signature": sign(body) }), SECRET, now)).toBe(true);
  });

  it("rejects tampered bodies, other secrets and malformed signatures", () => {
    const tampered = body.replace("1178.82", "1.00");
    expect(verifyCgpeySignature(tampered, headers({ "x-webhook-signature": sign(body) }), SECRET, now)).toBe(false);
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sign(body, "other") }), SECRET, now)).toBe(false);
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sign(body).slice(0, 63) }), SECRET, now)).toBe(false);
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": `${sign(body).slice(0, 63)}z` }), SECRET, now)).toBe(false);
    expect(verifyCgpeySignature(body, headers({}), SECRET, now)).toBe(false);
    expect(verifyCgpeySignature("not json", headers({ "x-webhook-signature": sign(body) }), SECRET, now)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sign(body, "") }), undefined, now)).toBe(false);
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sign(body, "") }), "", now)).toBe(false);
  });

  it("enforces a delivery timestamp when the provider sends one", () => {
    const sig = sign(body);
    const secs = (offset: number) => String(Math.floor(now.getTime() / 1000) + offset);
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sig, "x-webhook-timestamp": secs(-30) }), SECRET, now)).toBe(true);
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sig, "x-webhook-timestamp": String(now.getTime() - 1000) }), SECRET, now)).toBe(true);
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sig, "x-webhook-timestamp": now.toISOString() }), SECRET, now)).toBe(true);
    // Stale, too far in the future, or unreadable: refused even with a valid signature.
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sig, "x-webhook-timestamp": secs(-WEBHOOK_TOLERANCE_SECONDS - 1) }), SECRET, now)).toBe(false);
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sig, "x-webhook-timestamp": secs(WEBHOOK_TOLERANCE_SECONDS + 1) }), SECRET, now)).toBe(false);
    expect(verifyCgpeySignature(body, headers({ "x-webhook-signature": sig, "x-webhook-timestamp": "yesterday" }), SECRET, now)).toBe(false);
  });

  it("parses timestamps in seconds, milliseconds and ISO form only", () => {
    expect(parseWebhookTimestamp("1793700000")?.getTime()).toBe(1793700000 * 1000);
    expect(parseWebhookTimestamp("1793700000123")?.getTime()).toBe(1793700000123);
    expect(parseWebhookTimestamp("2026-11-03T10:00:00Z")?.toISOString()).toBe("2026-11-03T10:00:00.000Z");
    expect(parseWebhookTimestamp("2026-13-45T99:00:00Z")).toBeNull();
    expect(parseWebhookTimestamp("12")).toBeNull();
    expect(parseWebhookTimestamp("")).toBeNull();
  });
});

describe("parseWebhook", () => {
  it("maps a pay-in callback to an event with one id per order and status", () => {
    const e = parseWebhook(body, headers({ "x-webhook-event": "payin.status.updated" }));
    expect(e).toEqual({
      eventId: "payin:VAKTEST123:SUCCESS",
      type: "payin.status.updated",
      orderId: "VAKTEST123",
      status: "paid",
      amountPaise: 117882,
      providerPaymentId: "UTR1",
    });
  });

  it("maps failures and unknown statuses", () => {
    expect(parseWebhook(JSON.stringify({ status: "FAILED", order_id: "A1", amount: 10 }), headers({}))?.status).toBe("failed");
    expect(parseWebhook(JSON.stringify({ status: "PROCESSING", order_id: "A1", amount: 10 }), headers({}))?.status).toBe("pending");
  });

  it("returns null for bodies that are not pay-in events", () => {
    for (const raw of ["null", "[]", "42", '"x"', "{}", "{bad", JSON.stringify({ status: "SUCCESS" }), JSON.stringify({ order_id: "A1" })]) {
      expect(parseWebhook(raw, headers({})), raw).toBeNull();
    }
  });

  it("never invents an amount", () => {
    expect(parseWebhook(JSON.stringify({ status: "SUCCESS", order_id: "A1", amount: "abc" }), headers({}))?.amountPaise).toBeNull();
    expect(parseWebhook(JSON.stringify({ status: "SUCCESS", order_id: "A1", amount: -5 }), headers({}))?.amountPaise).toBeNull();
  });
});
