// Webhook activation end to end against an isolated in-memory PGlite (every
// migration + security.sql): applyPaymentWebhook for paid, duplicate, mismatch,
// failed, renewal, add-on and plan-switch cases, plus the signed route handler.
// Never calls the real provider: payments are inserted directly, as checkout would.

import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Env BEFORE any app module loads (they are imported dynamically below).
const WEBHOOK_SECRET = "integration-webhook-secret";
process.env.CGPEY_API_KEY = "test-key";
process.env.CGPEY_API_SECRET = "test-secret";
process.env.CGPEY_WEBHOOK_SECRET = WEBHOOK_SECRET;
delete process.env.DATABASE_URL;

// The in-memory database is slow on a busy machine; give each case room.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });
vi.mock("@/lib/db", async () => (await import("../../../test/pglite-db")).createTestDbModule());

type Mods = {
  dbm: typeof import("@/lib/db");
  schema: typeof import("@/lib/db/schema");
  orm: typeof import("drizzle-orm");
  activate: typeof import("./activate");
  pricing: typeof import("./pricing");
  entitlements: typeof import("@/lib/billing/entitlements");
  helpers: typeof import("../../../test/pglite-db");
};
let m: Mods;

const PROVIDER = "cgpey";
let seq = 0;
let userId = "";

beforeAll(async () => {
  m = {
    dbm: await import("@/lib/db"),
    schema: await import("@/lib/db/schema"),
    orm: await import("drizzle-orm"),
    activate: await import("./activate"),
    pricing: await import("./pricing"),
    entitlements: await import("@/lib/billing/entitlements"),
    helpers: await import("../../../test/pglite-db"),
  };
  await m.helpers.migrateTestDb(m.dbm.db);
  await m.helpers.seedTestPlans(m.dbm.db);
});

afterAll(async () => {
  if (m) await m.helpers.closeTestDb(m.dbm.db);
});

// A fresh user per test keeps the cases independent.
beforeEach(async () => {
  userId = `user-${++seq}`;
  await m.dbm.db.insert(m.schema.user).values({ id: userId, name: `User ${seq}`, email: `${userId}@example.test`, emailVerified: true });
});

type PlanId = import("@/lib/plans").PlanId;
type Interval = import("./pricing").BillingInterval;

/** A pending payment exactly as checkout creates it (amount from chargeFor). */
async function pendingPayment(planId: PlanId, interval: Interval = "month", amountPaise?: number) {
  const orderId = `ORD${seq}X${Math.random().toString(36).slice(2, 10)}`;
  const [p] = await m.dbm.db
    .insert(m.schema.payments)
    .values({
      userId,
      planId,
      interval,
      amountPaise: amountPaise ?? m.pricing.chargeFor(planId, interval).totalPaise,
      provider: PROVIDER,
      providerOrderId: orderId,
      status: "created",
    })
    .returning();
  return p;
}

function event(orderId: string, status: "paid" | "failed" | "pending", amountPaise: number | null) {
  const raw = status === "paid" ? "SUCCESS" : status === "failed" ? "FAILED" : "PENDING";
  return { eventId: `payin:${orderId}:${raw}`, type: "payin.status.updated", orderId, status, amountPaise, providerPaymentId: `UTR-${orderId}` };
}

async function pay(planId: PlanId, interval: Interval = "month") {
  const p = await pendingPayment(planId, interval);
  const outcome = await m.activate.applyPaymentWebhook(PROVIDER, event(p.providerOrderId!, "paid", p.amountPaise), { test: true }, { deliveryId: null });
  expect(outcome.kind).toBe("activated");
  return { payment: p, outcome };
}

async function subs() {
  const { eq, asc } = m.orm;
  return m.dbm.db.select().from(m.schema.subscriptions).where(eq(m.schema.subscriptions.userId, userId)).orderBy(asc(m.schema.subscriptions.createdAt), asc(m.schema.subscriptions.periodStart));
}
async function paymentRow(id: string) {
  const [p] = await m.dbm.db.select().from(m.schema.payments).where(m.orm.eq(m.schema.payments.id, id));
  return p;
}
async function audits(action: string) {
  return m.dbm.db.select().from(m.schema.auditEvents).where(m.orm.eq(m.schema.auditEvents.action, action));
}
const active = (rows: Awaited<ReturnType<typeof subs>>) => rows.filter((s) => s.status === "active");

describe("applyPaymentWebhook", () => {
  it("activates a subscription when a payment is confirmed", async () => {
    const before = Date.now();
    const { payment, outcome } = await pay("pro", "month");
    const [sub] = await subs();
    expect(sub).toMatchObject({ planId: "pro", status: "active", interval: "month", provider: PROVIDER, providerRef: payment.providerOrderId });
    expect(sub.periodStart.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(sub.periodEnd).toEqual(m.pricing.addInterval(sub.periodStart, "month"));
    const paid = await paymentRow(payment.id);
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).toBeInstanceOf(Date);
    expect(paid.providerPaymentId).toBe(`UTR-${payment.providerOrderId}`);
    expect(outcome).toMatchObject({ kind: "activated", paymentId: payment.id, userId });
    const [evt] = await m.dbm.db.select().from(m.schema.webhookEvents).where(m.orm.eq(m.schema.webhookEvents.providerEventId, `payin:${payment.providerOrderId}:SUCCESS`));
    expect(evt.processedAt).toBeInstanceOf(Date);
    expect((await audits("billing.subscription_activated")).some((a) => a.entityId === sub.id)).toBe(true);
    // The entitlement follows immediately.
    expect(await m.entitlements.getUpdatesAccess({ id: userId, role: "user" })).toEqual({ status: "paid", via: "pro", until: sub.periodEnd });
  });

  it("ignores a duplicate delivery of the same event", async () => {
    const { payment } = await pay("updates", "year");
    const again = await m.activate.applyPaymentWebhook(PROVIDER, event(payment.providerOrderId!, "paid", payment.amountPaise), {}, { deliveryId: "retry" });
    expect(again).toEqual({ kind: "duplicate" });
    expect(await subs()).toHaveLength(1);
  });

  it("refuses an amount that differs from the payment or the catalogue price", async () => {
    const p = await pendingPayment("pro", "month");
    const short = await m.activate.applyPaymentWebhook(PROVIDER, event(p.providerOrderId!, "paid", p.amountPaise - 100), {}, { deliveryId: null });
    expect(short).toEqual({ kind: "amount_mismatch", paymentId: p.id });
    expect((await paymentRow(p.id)).status).toBe("created");
    const missing = await pendingPayment("pro", "year");
    expect((await m.activate.applyPaymentWebhook(PROVIDER, event(missing.providerOrderId!, "paid", null), {}, { deliveryId: null })).kind).toBe("amount_mismatch");
    // A pending row whose stored amount is not the catalogue price is refused even when the event matches it.
    const forged = await pendingPayment("chambers", "month", 100);
    expect((await m.activate.applyPaymentWebhook(PROVIDER, event(forged.providerOrderId!, "paid", 100), {}, { deliveryId: null })).kind).toBe("amount_mismatch");
    // Free plan and unknown interval can never be activated by a payment.
    const free = await pendingPayment("free", "month", 0);
    expect((await m.activate.applyPaymentWebhook(PROVIDER, event(free.providerOrderId!, "paid", 0), {}, { deliveryId: null })).kind).toBe("amount_mismatch");
    const [odd] = await m.dbm.db
      .insert(m.schema.payments)
      .values({ userId, planId: "pro", interval: null, amountPaise: 117882, provider: PROVIDER, providerOrderId: `ODD${seq}`, status: "created" })
      .returning();
    expect((await m.activate.applyPaymentWebhook(PROVIDER, event(odd.providerOrderId!, "paid", 117882), {}, { deliveryId: null })).kind).toBe("amount_mismatch");
    expect(await subs()).toHaveLength(0);
    expect((await audits("billing.amount_mismatch")).some((a) => a.entityId === p.id)).toBe(true);
  });

  it("records a failed payment without activating anything", async () => {
    const p = await pendingPayment("pro", "month");
    const out = await m.activate.applyPaymentWebhook(PROVIDER, event(p.providerOrderId!, "failed", null), {}, { deliveryId: null });
    expect(out).toEqual({ kind: "failed_payment", paymentId: p.id });
    expect((await paymentRow(p.id)).status).toBe("failed");
    expect(await subs()).toHaveLength(0);
    // A late success for the same order still activates (UPI can flip FAILED -> SUCCESS).
    const late = await m.activate.applyPaymentWebhook(PROVIDER, event(p.providerOrderId!, "paid", p.amountPaise), {}, { deliveryId: null });
    expect(late.kind).toBe("activated");
  });

  it("ignores pending updates, unknown orders and a failure after success", async () => {
    const p = await pendingPayment("pro", "month");
    expect(await m.activate.applyPaymentWebhook(PROVIDER, event(p.providerOrderId!, "pending", null), {}, { deliveryId: null })).toEqual({ kind: "ignored", reason: "pending" });
    expect(await m.activate.applyPaymentWebhook(PROVIDER, event("NO-SUCH-ORDER", "paid", 100), {}, { deliveryId: null })).toEqual({ kind: "ignored", reason: "unknown_order" });
    // Another provider's event with the same order id is not ours.
    expect((await m.activate.applyPaymentWebhook("other", event(p.providerOrderId!, "paid", p.amountPaise), {}, { deliveryId: null })).kind).toBe("ignored");
    await m.activate.applyPaymentWebhook(PROVIDER, event(p.providerOrderId!, "paid", p.amountPaise), {}, { deliveryId: null });
    expect(await m.activate.applyPaymentWebhook(PROVIDER, event(p.providerOrderId!, "failed", null), {}, { deliveryId: null })).toEqual({ kind: "ignored", reason: "already_paid" });
    expect((await paymentRow(p.id)).status).toBe("paid");
    expect(active(await subs())).toHaveLength(1);
  });

  it("extends a renewal of the same plan from the current period end", async () => {
    await pay("pro", "month");
    await pay("pro", "month");
    await pay("pro", "year");
    const rows = await subs();
    expect(active(rows)).toHaveLength(3);
    expect(rows[1].periodStart).toEqual(rows[0].periodEnd);
    expect(rows[1].periodEnd).toEqual(m.pricing.addInterval(rows[0].periodEnd, "month"));
    expect(rows[2].periodStart).toEqual(rows[1].periodEnd);
    expect(rows[2].periodEnd).toEqual(m.pricing.addInterval(rows[1].periodEnd, "year"));
    const access = await m.entitlements.getUpdatesAccess({ id: userId });
    expect(access).toEqual({ status: "paid", via: "pro", until: rows[2].periodEnd });
  });

  it("keeps the main plan when the add-on is bought, and the add-on when a main plan is bought", async () => {
    await pay("pro", "month");
    await pay("updates", "month");
    let rows = active(await subs());
    expect(rows.map((s) => s.planId).sort()).toEqual(["pro", "updates"]);
    // The add-on starts now, inside Pro's period: it is not queued as a renewal of Pro.
    expect(rows[1].periodStart.getTime()).toBeGreaterThanOrEqual(rows[0].periodStart.getTime());
    expect(rows[1].periodStart.getTime()).toBeLessThan(rows[0].periodEnd.getTime());
    await pay("chambers", "year");
    rows = active(await subs());
    expect(rows.map((s) => s.planId).sort()).toEqual(["chambers", "updates"]);
  });

  it("cancels the old main plan when switching, and the new one starts now", async () => {
    await pay("pro", "month");
    await pay("pro", "month"); // a queued renewal is cancelled too
    const before = Date.now();
    await pay("chambers", "month");
    const rows = await subs();
    expect(rows.filter((s) => s.planId === "pro").map((s) => s.status)).toEqual(["cancelled", "cancelled"]);
    const [chambers] = rows.filter((s) => s.planId === "chambers");
    expect(chambers.status).toBe("active");
    expect(chambers.periodStart.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(chambers.periodStart.getTime()).toBeLessThan(rows[0].periodEnd.getTime());
  });

  it("only activates for the payment's own user", async () => {
    const p = await pendingPayment("updates", "month");
    const other = `${userId}-other`;
    await m.dbm.db.insert(m.schema.user).values({ id: other, name: "Other", email: `${other}@example.test`, emailVerified: true });
    await m.activate.applyPaymentWebhook(PROVIDER, event(p.providerOrderId!, "paid", p.amountPaise), {}, { deliveryId: null });
    const theirs = await m.dbm.db.select().from(m.schema.subscriptions).where(m.orm.eq(m.schema.subscriptions.userId, other));
    expect(theirs).toEqual([]);
    expect(active(await subs()).map((s) => s.planId)).toEqual(["updates"]);
  });
});

describe("POST /api/webhooks/payments", () => {
  const sign = (body: string) => createHmac("sha256", WEBHOOK_SECRET).update(body, "utf8").digest("hex");
  function request(body: string, headers: Record<string, string>) {
    return new Request("http://localhost:3000/api/webhooks/payments", {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-event": "payin.status.updated", ...headers },
      body,
    });
  }

  it("activates only for a correctly signed, fresh callback", async () => {
    const { POST } = await import("@/app/api/webhooks/payments/route");
    const p = await pendingPayment("pro", "month");
    const body = JSON.stringify({ status: "SUCCESS", order_id: p.providerOrderId, utr: "UTR9", amount: (p.amountPaise / 100).toFixed(2), date: "2026-11-03" });

    const forged = await POST(request(body, { "x-webhook-signature": "0".repeat(64) }));
    expect(forged.status).toBe(401);
    const stale = await POST(request(body, { "x-webhook-signature": sign(body), "x-webhook-timestamp": String(Math.floor(Date.now() / 1000) - 3600) }));
    expect(stale.status).toBe(401);
    expect(await subs()).toHaveLength(0);
    expect((await audits("billing.webhook_rejected")).length).toBeGreaterThanOrEqual(2);

    const res = await POST(request(body, { "x-webhook-signature": sign(body), "x-webhook-timestamp": String(Math.floor(Date.now() / 1000)) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: true, outcome: "activated" });
    const replay = await POST(request(body, { "x-webhook-signature": sign(body) }));
    expect(await replay.json()).toMatchObject({ status: true, outcome: "duplicate" });
    expect(active(await subs()).map((s) => s.planId)).toEqual(["pro"]);
  });

  it("refuses oversized bodies before verifying", async () => {
    const { POST } = await import("@/app/api/webhooks/payments/route");
    const big = "x".repeat(65 * 1024);
    expect((await POST(request(big, { "x-webhook-signature": sign(big) }))).status).toBe(413);
  });
});
