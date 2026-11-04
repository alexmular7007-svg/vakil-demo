import "server-only";
import { env, features } from "@/lib/env";

/** Checkout needs the API key + secret, the webhook secret and the merchant id. */
export function paymentsConfigured() {
  return features.cgpeyPayments && Boolean(env.CGPEY_MERCHANT_ID);
}

/**
 * Payment provider abstraction. Checkout creates a provider payment and sends the
 * user to it; subscriptions are activated only by a signed webhook
 * (src/app/api/webhooks/payments/route.ts), never by the browser returning.
 */

export type CreatePaymentInput = {
  /** Our order id (billing.payments.provider_order_id). Unique, [A-Za-z0-9_-]. */
  orderId: string;
  amountPaise: number;
  payerName: string;
  payerMobile: string;
  payerEmail: string;
  description: string;
  returnUrl: string;
};

export type CreatePaymentResult = {
  /** Hosted payment page (https) to send the payer to, when the provider returns one. */
  redirectUrl: string | null;
  /** UPI intent (upi://...) to open in a UPI app or show as a QR code. */
  upiIntent: string | null;
  providerPaymentId: string | null;
};

export type WebhookEvent = {
  /** Stable id for idempotency (billing.webhook_events.provider_event_id). */
  eventId: string;
  type: string;
  orderId: string;
  status: "paid" | "failed" | "pending";
  amountPaise: number | null;
  providerPaymentId: string | null;
};

export interface PaymentProvider {
  readonly id: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Constant-time check of the webhook signature over the raw request body. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  /** Parses a verified webhook body. Returns null when the payload is not a payment event. */
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent | null;
}

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super("Online payments are not configured yet.");
  }
}

export class PaymentProviderError extends Error {}

export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (!paymentsConfigured()) throw new PaymentsNotConfiguredError();
  const { cgpeyPayments } = await import("./cgpey");
  return cgpeyPayments;
}
