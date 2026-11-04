import { NextResponse } from "next/server";
import { features } from "@/lib/env";
import { appendAudit } from "@/lib/audit";
import { applyPaymentWebhook } from "@/lib/payments/activate";

// Payment provider callbacks. The only place a subscription is activated.
// Order of checks: configured -> size -> HMAC signature over the raw body
// (constant time) -> parse -> idempotent record -> amount vs plan price -> activate + audit.

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  if (!features.cgpeyPayments) {
    return NextResponse.json({ status: false, message: "Payments are not configured." }, { status: 503 });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ status: false, message: "Payload too large." }, { status: 413 });
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ status: false, message: "Payload too large." }, { status: 413 });
  }

  const { cgpeyPayments: provider } = await import("@/lib/payments/cgpey");
  if (!provider.verifyWebhook(rawBody, request.headers)) {
    await appendAudit({
      action: "billing.webhook_rejected",
      actorRole: "system",
      entityType: "webhook",
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      data: { provider: provider.id, reason: "bad_signature" },
    });
    return NextResponse.json({ status: false, message: "Invalid webhook signature" }, { status: 401 });
  }

  const event = provider.parseWebhook(rawBody, request.headers);
  if (!event) {
    // Signed but not a pay-in status event (for example a payout callback): acknowledge, do nothing.
    return NextResponse.json({ status: true, code: 200, message: "ignored" });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }

  try {
    const outcome = await applyPaymentWebhook(provider.id, event, payload, {
      deliveryId: request.headers.get("x-webhook-delivery-id")?.slice(0, 120) ?? null,
    });
    return NextResponse.json({ status: true, code: 200, message: "callback received successfully", outcome: outcome.kind });
  } catch (err) {
    console.error("[webhook] processing failed", err);
    // 500 lets the provider retry; the transaction rolled back, so the retry is processed fresh.
    return NextResponse.json({ status: false, message: "Processing failed" }, { status: 500 });
  }
}
