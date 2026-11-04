import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import {
  PaymentProviderError,
  PaymentsNotConfiguredError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type WebhookEvent,
} from "./provider";

/**
 * CGPEY pay-in (UPI), as documented on https://dashboard.cgpey.com/payin-api-docs
 * ("Payin" section, read 2026-11-02):
 *
 *   POST https://lamda.cgpey.com/api/v2/makepayment
 *   headers: x-api-key, x-secret-key, Content-Type: application/json
 *   body:    { user_id (merchant id), name (letters and spaces), mobile_number,
 *              amount (INR, number, min 1), transaction_id ([A-Za-z0-9_-], unique),
 *              return_url }
 *   200:     { status: true, code: 200, data: { intentData, txnId, clientRefId, status, ... } }
 *
 *   Callback: headers X-Webhook-Event: payin.status.updated, X-Webhook-Signature
 *   (HMAC-SHA256 hex of the JSON payload with the merchant secret key),
 *   X-Webhook-Delivery-Id; body { status: SUCCESS|FAILED, order_id, message, utr,
 *   amount: "11.00", date }.
 *
 * The pay-in API authenticates with the API key + secret key headers. The JWT from
 * POST {CGPEY_BASE_URL}/api/auth/generate-api-token is documented for the payout
 * API only, so it is not used here. Keys are read from the server environment only.
 */

const PAYIN_BASE_URL = (process.env.CGPEY_PAYIN_BASE_URL ?? "https://lamda.cgpey.com").replace(/\/+$/, "");

function credentials() {
  if (!env.CGPEY_API_KEY || !env.CGPEY_API_SECRET || !env.CGPEY_MERCHANT_ID) throw new PaymentsNotConfiguredError();
  return { apiKey: env.CGPEY_API_KEY, secretKey: env.CGPEY_API_SECRET, merchantId: env.CGPEY_MERCHANT_ID };
}

/** "letters and spaces only" per the docs. */
function payerName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^A-Za-z ]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 60) || "Vaakil Customer";
}

function safeUrl(value: unknown): { redirectUrl: string | null; upiIntent: string | null } {
  if (typeof value !== "string") return { redirectUrl: null, upiIntent: null };
  const v = value.trim();
  try {
    const u = new URL(v);
    if (u.protocol === "https:") return { redirectUrl: u.toString(), upiIntent: null };
    if (u.protocol === "upi:") return { redirectUrl: null, upiIntent: v };
  } catch {
    // not a URL
  }
  return { redirectUrl: null, upiIntent: null };
}

async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const { apiKey, secretKey, merchantId } = credentials();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(input.orderId)) throw new PaymentProviderError("Invalid order id.");
  const body = {
    user_id: merchantId,
    name: payerName(input.payerName),
    mobile_number: input.payerMobile,
    amount: Number((input.amountPaise / 100).toFixed(2)),
    transaction_id: input.orderId,
    return_url: input.returnUrl,
  };
  let res: Response;
  try {
    res = await fetch(`${PAYIN_BASE_URL}/api/v2/makepayment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": apiKey,
        "x-secret-key": secretKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.error("[cgpey] makepayment network error", err instanceof Error ? err.message : err);
    throw new PaymentProviderError("The payment provider could not be reached. Please try again.");
  }
  const json = (await res.json().catch(() => null)) as {
    status?: boolean;
    code?: number;
    message?: string;
    data?: { intentData?: unknown; qrData?: unknown; txnId?: unknown };
  } | null;
  if (!res.ok || !json || json.status !== true) {
    console.error("[cgpey] makepayment rejected", res.status, json?.code, json?.message);
    throw new PaymentProviderError(
      res.status === 401 ? "The payment provider rejected our credentials. Please contact support." : "The payment provider could not start this payment.",
    );
  }
  const target = safeUrl(json.data?.intentData);
  if (!target.redirectUrl && !target.upiIntent) {
    const qr = safeUrl(json.data?.qrData);
    if (!qr.redirectUrl && !qr.upiIntent) {
      console.error("[cgpey] makepayment returned no usable payment link");
      throw new PaymentProviderError("The payment provider did not return a payment link.");
    }
    return { ...qr, providerPaymentId: typeof json.data?.txnId === "string" ? json.data.txnId : null };
  }
  return { ...target, providerPaymentId: typeof json.data?.txnId === "string" ? json.data.txnId : null };
}

/** HMAC-SHA256 of the payload, as raw bytes. */
function hmac(secret: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(payload, "utf8").digest();
}

/** Constant-time comparison of two equal-length digests (lengths are public: 32 bytes). */
function digestsMatch(expected: Buffer, received: Buffer): boolean {
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Delivery timestamp header, in the same family as X-Webhook-Event/-Signature/-Delivery-Id.
 * CGPEY's docs (read 2026-11-02) do not list one; if they start sending it, it is enforced.
 */
const TIMESTAMP_HEADER = "x-webhook-timestamp";
/** How far a delivery timestamp may be from our clock (replays older than this are refused). */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Parses a delivery timestamp: Unix seconds, Unix milliseconds, or an ISO 8601 date.
 * Returns null when the value cannot be read.
 */
export function parseWebhookTimestamp(value: string): Date | null {
  const v = value.trim();
  if (/^\d{9,11}$/.test(v)) return new Date(Number(v) * 1000);
  if (/^\d{12,14}$/.test(v)) return new Date(Number(v));
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Verifies a CGPEY callback: HMAC-SHA256 (hex) of the body with the webhook secret in
 * X-Webhook-Signature, compared in constant time. When the delivery carries a
 * timestamp header, it must be readable and within WEBHOOK_TOLERANCE_SECONDS of `now`,
 * so a captured old delivery cannot be replayed. (Replays without a timestamp are
 * still harmless: events are recorded once per order and status, and a paid payment
 * is never processed twice.) Pure: the secret and clock are passed in.
 */
export function verifyCgpeySignature(rawBody: string, headers: Headers, secret: string | undefined, now: Date = new Date()): boolean {
  const signature = headers.get("x-webhook-signature")?.trim().toLowerCase();
  if (!secret || !signature || !/^[0-9a-f]{64}$/.test(signature)) return false;

  const sentAt = headers.get(TIMESTAMP_HEADER);
  if (sentAt !== null) {
    const at = parseWebhookTimestamp(sentAt);
    if (!at || Math.abs(now.getTime() - at.getTime()) > WEBHOOK_TOLERANCE_SECONDS * 1000) return false;
  }

  const received = Buffer.from(signature, "hex");
  // Exact bytes as received.
  if (digestsMatch(hmac(secret, rawBody), received)) return true;
  // CGPEY's reference verifier signs JSON.stringify(payload); accept that canonical
  // form too in case a proxy re-serialised whitespace. Still keyed with our secret.
  try {
    const compact = JSON.stringify(JSON.parse(rawBody));
    return compact !== rawBody && digestsMatch(hmac(secret, compact), received);
  } catch {
    return false;
  }
}

function verifyWebhook(rawBody: string, headers: Headers): boolean {
  return verifyCgpeySignature(rawBody, headers, env.CGPEY_WEBHOOK_SECRET);
}

export function parseWebhook(rawBody: string, headers: Headers): WebhookEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const payload = parsed as Record<string, unknown>;
  const orderId = typeof payload.order_id === "string" ? payload.order_id.trim() : "";
  const rawStatus = typeof payload.status === "string" ? payload.status.trim().toUpperCase() : "";
  if (!orderId || !rawStatus) return null;
  const status: WebhookEvent["status"] =
    rawStatus === "SUCCESS" ? "paid" : rawStatus === "FAILED" || rawStatus === "FAILURE" ? "failed" : "pending";
  const amount = typeof payload.amount === "number" ? payload.amount : Number(String(payload.amount ?? "").trim());
  const utr = typeof payload.utr === "string" && payload.utr.trim() ? payload.utr.trim() : null;
  return {
    // One event per order and status: retries of the same callback are recorded once.
    eventId: `payin:${orderId}:${rawStatus}`,
    type: headers.get("x-webhook-event")?.slice(0, 80) || "payin.status.updated",
    orderId,
    status,
    amountPaise: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null,
    providerPaymentId: utr,
  };
}

export const cgpeyPayments: PaymentProvider = {
  id: "cgpey",
  createPayment,
  verifyWebhook,
  parseWebhook,
};
