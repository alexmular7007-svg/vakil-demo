import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { appendAudit } from "@/lib/audit";
import { AadhaarAggregatorProvider, ProviderNotConfiguredError, verifyWebhookSignature, type SignatureProvider } from "@/lib/esign/provider";

// Webhook endpoint for a licensed Aadhaar eSign aggregator. The HMAC is verified
// before anything else; without ESIGN_WEBHOOK_SECRET the endpoint answers 501.

const MAX_BODY = 1024 * 1024;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const secret = env.ESIGN_WEBHOOK_SECRET;
  if (!secret) return json({ ok: false, error: "E-sign webhooks are not configured." }, 501);

  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY) return json({ ok: false, error: "Payload too large." }, 413);
  const raw = await req.text();
  const signature =
    req.headers.get("x-esign-signature") ?? req.headers.get("x-webhook-signature") ?? req.headers.get("x-signature") ?? "";
  if (raw.length > MAX_BODY || !signature || !verifyWebhookSignature(raw, signature, secret)) {
    return json({ ok: false, error: "Invalid signature." }, 401);
  }

  try {
    const provider: SignatureProvider = new AadhaarAggregatorProvider();
    const event = await provider.handleWebhook(raw, signature);
    await appendAudit({ action: "esign.webhook_received", actorRole: "provider", entityType: "esign.provider", entityId: event.provider, data: { type: event.type } });
    return json({ ok: true }, 200);
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      await appendAudit({ action: "esign.webhook_unhandled", actorRole: "provider", entityType: "esign.provider", entityId: env.ESIGN_PROVIDER });
      return json({ ok: false, error: err.message }, 501);
    }
    console.error("[esign] webhook failed", err);
    return json({ ok: false, error: "Webhook processing failed." }, 500);
  }
}
