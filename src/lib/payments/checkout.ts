import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { auditEvents, payments } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { ActionError } from "@/lib/action";
import { randomToken } from "@/lib/crypto";
import { planById } from "@/lib/plans";
import { chargeFor, isPaidPlan, isPurchasable, type BillingInterval } from "./pricing";
import type { CreatePaymentResult, PaymentProvider } from "./provider";

/**
 * A `created` payment for the same plan, interval and amount younger than this is
 * reused instead of opening a second order, so a double click, a retry or a second
 * tab cannot leave the user with two payable requests for one plan.
 */
export const CHECKOUT_REUSE_MINUTES = 10;
/** A reusable payment with no recorded payment link this young is still being set up. */
export const CHECKOUT_IN_FLIGHT_SECONDS = 60;

// Serialises checkouts per user (pg_advisory_xact_lock(namespace, hashtext(user id))).
const CHECKOUT_LOCK_NAMESPACE = 7340002;

export type CheckoutTarget = Pick<CreatePaymentResult, "redirectUrl" | "upiIntent">;

export type CheckoutStarted = CheckoutTarget & {
  paymentId: string;
  orderId: string;
  amountPaise: number;
  /** True when an earlier pending payment for the same plan was handed back. */
  reused: boolean;
};

export type BeginCheckoutInput = {
  /** The verified session user. Never an id from the request. */
  user: { id: string; name: string; email: string; role?: string | null };
  planId: string;
  interval: string;
  mobile: string;
  provider: PaymentProvider;
  returnUrl: (orderId: string) => string;
  ip?: string | null;
  now?: Date;
};

/**
 * Starts (or resumes) a checkout. Creates a pending `created` payment on the owner
 * connection (billing.payments is read-only for app_user) and returns the provider's
 * payment link. The amount always comes from chargeFor(); the plan changes only when
 * the signed webhook confirms the payment (src/lib/payments/activate.ts).
 *
 * Throws ActionError for user-facing refusals and PaymentProviderError when the
 * provider refuses; the caller maps both to messages.
 */
export async function beginCheckout(input: BeginCheckoutInput): Promise<CheckoutStarted> {
  const { user, provider } = input;
  const now = input.now ?? new Date();
  if (!isPaidPlan(input.planId) || !isPurchasable(input.planId, input.interval)) throw new ActionError("That plan is not available.");
  const planId = input.planId;
  const interval = input.interval as BillingInterval;
  const charge = chargeFor(planId, interval);

  const reservation = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CHECKOUT_LOCK_NAMESPACE}::int, hashtext(${user.id}::text))`);
    const [pending] = await tx
      .select({ id: payments.id, orderId: payments.providerOrderId, createdAt: payments.createdAt })
      .from(payments)
      .where(
        and(
          eq(payments.userId, user.id),
          eq(payments.provider, provider.id),
          eq(payments.planId, planId),
          eq(payments.interval, interval),
          eq(payments.amountPaise, charge.totalPaise),
          eq(payments.status, "created"),
          gt(payments.createdAt, new Date(now.getTime() - CHECKOUT_REUSE_MINUTES * 60_000)),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);
    if (pending?.orderId) {
      const target = await recordedTarget(tx, pending.id);
      if (target) return { kind: "reuse" as const, paymentId: pending.id, orderId: pending.orderId, target };
      if (pending.createdAt.getTime() > now.getTime() - CHECKOUT_IN_FLIGHT_SECONDS * 1000) return { kind: "in_flight" as const };
      // Older and never got a link (the provider call died half-way): start a fresh one.
    }
    const orderId = newOrderId(now);
    const [row] = await tx
      .insert(payments)
      .values({
        userId: user.id,
        planId,
        interval,
        amountPaise: charge.totalPaise,
        currency: "INR",
        provider: provider.id,
        providerOrderId: orderId,
        status: "created",
        createdAt: now,
      })
      .returning({ id: payments.id });
    return { kind: "new" as const, paymentId: row.id, orderId };
  });

  if (reservation.kind === "in_flight") {
    throw new ActionError("This payment is already being set up. Please wait a few seconds and try again.");
  }
  if (reservation.kind === "reuse") {
    await appendAudit({
      action: "billing.checkout_resumed",
      actorId: user.id,
      actorRole: user.role ?? null,
      entityType: "payment",
      entityId: reservation.paymentId,
      ip: input.ip ?? null,
      data: { planId, interval, amountPaise: charge.totalPaise, provider: provider.id },
    });
    return { ...reservation.target, paymentId: reservation.paymentId, orderId: reservation.orderId, amountPaise: charge.totalPaise, reused: true };
  }

  const { paymentId, orderId } = reservation;
  let result: CreatePaymentResult;
  try {
    result = await provider.createPayment({
      orderId,
      amountPaise: charge.totalPaise,
      payerName: user.name,
      payerMobile: input.mobile,
      payerEmail: user.email,
      description: `${planById[planId].name} (${interval === "year" ? "yearly" : "monthly"})`,
      returnUrl: input.returnUrl(orderId),
    });
  } catch (err) {
    await db.update(payments).set({ status: "failed" }).where(and(eq(payments.id, paymentId), eq(payments.status, "created")));
    await appendAudit({
      action: "billing.checkout_failed",
      actorId: user.id,
      actorRole: user.role ?? null,
      entityType: "payment",
      entityId: paymentId,
      ip: input.ip ?? null,
      data: { planId, interval, provider: provider.id },
    });
    throw err;
  }

  const target = cleanTarget(result);
  if (!target) {
    await db.update(payments).set({ status: "failed" }).where(and(eq(payments.id, paymentId), eq(payments.status, "created")));
    throw new ActionError("The payment provider did not return a payment link. Please try again.");
  }
  if (result.providerPaymentId) {
    await db.update(payments).set({ providerPaymentId: result.providerPaymentId }).where(eq(payments.id, paymentId));
  }
  // The audit record doubles as the store of the payment link, so a retry inside the
  // reuse window gets the same link back (billing.payments has no column for it).
  await appendAudit({
    action: "billing.checkout_started",
    actorId: user.id,
    actorRole: user.role ?? null,
    entityType: "payment",
    entityId: paymentId,
    ip: input.ip ?? null,
    data: { planId, interval, amountPaise: charge.totalPaise, provider: provider.id, orderId, ...target },
  });
  return { ...target, paymentId, orderId, amountPaise: charge.totalPaise, reused: false };
}

function newOrderId(now: Date) {
  return `VAK${now.getTime().toString(36).toUpperCase()}${randomToken(6).replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 40);
}

/** Only https pages and upi: intents are ever handed to the browser. */
function cleanTarget(v: { redirectUrl?: unknown; upiIntent?: unknown } | null | undefined): CheckoutTarget | null {
  const redirectUrl = typeof v?.redirectUrl === "string" && /^https:\/\//i.test(v.redirectUrl) ? v.redirectUrl : null;
  const upiIntent = typeof v?.upiIntent === "string" && /^upi:/i.test(v.upiIntent) ? v.upiIntent : null;
  return redirectUrl || upiIntent ? { redirectUrl, upiIntent } : null;
}

/** The payment link recorded when this payment's checkout started, if any. */
async function recordedTarget(tx: Tx, paymentId: string): Promise<CheckoutTarget | null> {
  const [row] = await tx
    .select({ data: auditEvents.data })
    .from(auditEvents)
    .where(and(eq(auditEvents.entityType, "payment"), eq(auditEvents.entityId, paymentId), eq(auditEvents.action, "billing.checkout_started")))
    .orderBy(desc(auditEvents.seq))
    .limit(1);
  return cleanTarget(row?.data as { redirectUrl?: unknown; upiIntent?: unknown } | null);
}
