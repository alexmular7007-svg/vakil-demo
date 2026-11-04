import "server-only";
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { payments, subscriptions, webhookEvents } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { addInterval, chargeFor, isBillingInterval, isPaidPlan, planGroup } from "./pricing";
import type { WebhookEvent } from "./provider";

export type WebhookOutcome =
  | { kind: "duplicate" }
  | { kind: "ignored"; reason: string }
  | { kind: "failed_payment"; paymentId: string }
  | { kind: "amount_mismatch"; paymentId: string }
  | { kind: "activated"; paymentId: string; subscriptionId: string; userId: string };

/**
 * Applies a verified payment webhook. Runs on the owner connection (billing tables
 * are read-only for app_user) inside one transaction, so the idempotency row, the
 * payment update and the subscription commit together or not at all.
 * Call only after the signature has been verified.
 */
export async function applyPaymentWebhook(
  provider: string,
  event: WebhookEvent,
  payload: unknown,
  meta: { deliveryId: string | null },
): Promise<WebhookOutcome> {
  const outcome = await db.transaction(async (tx): Promise<WebhookOutcome> => {
    const [recorded] = await tx
      .insert(webhookEvents)
      .values({
        provider,
        providerEventId: event.eventId,
        type: event.type,
        payload: { body: payload, deliveryId: meta.deliveryId },
      })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.providerEventId] })
      .returning({ id: webhookEvents.id });
    if (!recorded) return { kind: "duplicate" };

    const markProcessed = () =>
      tx.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, recorded.id));

    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.provider, provider), eq(payments.providerOrderId, event.orderId)))
      .limit(1)
      .for("update");
    if (!payment) {
      await markProcessed();
      return { kind: "ignored", reason: "unknown_order" };
    }
    if (payment.status === "paid") {
      await markProcessed();
      return { kind: "ignored", reason: "already_paid" };
    }
    if (event.status === "pending") {
      await markProcessed();
      return { kind: "ignored", reason: "pending" };
    }
    if (event.status === "failed") {
      await tx
        .update(payments)
        .set({ status: "failed", providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId })
        .where(eq(payments.id, payment.id));
      await markProcessed();
      return { kind: "failed_payment", paymentId: payment.id };
    }

    // status === "paid": the plan and interval must be in the catalogue, and the amount
    // must equal both what we asked for and the catalogue price (chargeFor).
    const planId = payment.planId ?? "";
    const interval = isBillingInterval(payment.interval) ? payment.interval : null;
    const expected = interval && isPaidPlan(planId) ? chargeFor(planId, interval).totalPaise : null;
    if (interval === null || expected === null || event.amountPaise !== payment.amountPaise || event.amountPaise !== expected) {
      await markProcessed();
      return { kind: "amount_mismatch", paymentId: payment.id };
    }

    const now = new Date();
    await tx
      .update(payments)
      .set({ status: "paid", paidAt: now, providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId })
      .where(eq(payments.id, payment.id));

    // Renewal of the same plan extends from the current period end; a new plan starts now
    // and replaces any other active plan.
    const [current] = await tx
      .select({ id: subscriptions.id, planId: subscriptions.planId, periodEnd: subscriptions.periodEnd })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, payment.userId),
          eq(subscriptions.status, "active"),
          gt(subscriptions.periodEnd, now),
          inArray(subscriptions.planId, planGroup(planId)),
        ),
      )
      .orderBy(desc(subscriptions.periodEnd))
      .limit(1);
    const periodStart = current && current.planId === planId ? current.periodEnd : now;
    if (!current || current.planId !== planId) {
      // Only plans in the same group are replaced: buying the updates add-on keeps Pro.
      await tx
        .update(subscriptions)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(subscriptions.userId, payment.userId),
            eq(subscriptions.status, "active"),
            ne(subscriptions.planId, planId),
            inArray(subscriptions.planId, planGroup(planId)),
          ),
        );
    }
    const [sub] = await tx
      .insert(subscriptions)
      .values({
        userId: payment.userId,
        planId,
        status: "active",
        interval,
        periodStart,
        periodEnd: addInterval(periodStart, interval),
        provider,
        providerRef: payment.providerOrderId,
      })
      .returning({ id: subscriptions.id });
    await markProcessed();
    return { kind: "activated", paymentId: payment.id, subscriptionId: sub.id, userId: payment.userId };
  });

  if (outcome.kind === "activated") {
    await appendAudit({
      action: "billing.subscription_activated",
      actorId: null,
      actorRole: "system",
      entityType: "subscription",
      entityId: outcome.subscriptionId,
      data: { provider, paymentId: outcome.paymentId, userId: outcome.userId, eventId: event.eventId },
    });
  } else if (outcome.kind === "amount_mismatch") {
    await appendAudit({
      action: "billing.amount_mismatch",
      actorRole: "system",
      entityType: "payment",
      entityId: outcome.paymentId,
      data: { provider, eventId: event.eventId, receivedPaise: event.amountPaise },
    });
  } else if (outcome.kind === "failed_payment") {
    await appendAudit({
      action: "billing.payment_failed",
      actorRole: "system",
      entityType: "payment",
      entityId: outcome.paymentId,
      data: { provider, eventId: event.eventId },
    });
  } else if (outcome.kind === "ignored") {
    await appendAudit({
      action: "billing.webhook_ignored",
      actorRole: "system",
      entityType: "webhook",
      entityId: event.eventId,
      data: { provider, reason: outcome.reason },
    });
  }
  return outcome;
}
