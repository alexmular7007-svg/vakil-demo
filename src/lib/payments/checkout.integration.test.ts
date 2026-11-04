// Checkout against an isolated in-memory PGlite (every migration + security.sql)
// with a fake payment provider: catalogue validation, chargeFor as the only amount,
// reuse of a recent pending payment instead of a duplicate, the in-flight guard,
// provider failures, and the startCheckout server action's discipline. The real
// CGPEY API is never called.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

delete process.env.DATABASE_URL;

const state = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; email: string; role: "user" | "admin" },
  configured: true,
  revalidated: [] as string[],
  calls: [] as { orderId: string; amountPaise: number; payerMobile: string; returnUrl: string }[],
  mode: "redirect" as "redirect" | "upi" | "reject" | "crash" | "nolink",
}));

// The in-memory database is slow on a busy machine; give each case room.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });
vi.mock("@/lib/db", async () => (await import("../../../test/pglite-db")).createTestDbModule());
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void state.revalidated.push(p) }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: async () => state.user, requestIp: async () => "203.0.113.9" }));
vi.mock("@/lib/payments/provider", async (importOriginal) => {
  const real = await importOriginal<typeof import("./provider")>();
  const fake: import("./provider").PaymentProvider = {
    id: "fakepay",
    async createPayment(input) {
      state.calls.push({ orderId: input.orderId, amountPaise: input.amountPaise, payerMobile: input.payerMobile, returnUrl: input.returnUrl });
      if (state.mode === "reject") throw new real.PaymentProviderError("The payment provider could not start this payment.");
      if (state.mode === "crash") throw new Error("socket hang up");
      if (state.mode === "nolink") return { redirectUrl: "http://insecure.example/pay", upiIntent: null, providerPaymentId: null };
      if (state.mode === "upi") return { redirectUrl: null, upiIntent: `upi://pay?pa=merchant@bank&am=${input.amountPaise / 100}&tr=${input.orderId}`, providerPaymentId: `TXN-${input.orderId}` };
      return { redirectUrl: `https://pay.example/checkout/${input.orderId}`, upiIntent: null, providerPaymentId: null };
    },
    verifyWebhook: () => false,
    parseWebhook: () => null,
  };
  return { ...real, paymentsConfigured: () => state.configured, getPaymentProvider: async () => fake, fakeProvider: fake };
});

type Mods = {
  dbm: typeof import("@/lib/db");
  schema: typeof import("@/lib/db/schema");
  orm: typeof import("drizzle-orm");
  checkout: typeof import("./checkout");
  actions: typeof import("@/app/app/settings/billing/actions");
  pricing: typeof import("./pricing");
  provider: typeof import("./provider") & { fakeProvider: import("./provider").PaymentProvider };
  action: typeof import("@/lib/action");
  helpers: typeof import("../../../test/pglite-db");
};
let m: Mods;
let seq = 0;

beforeAll(async () => {
  m = {
    dbm: await import("@/lib/db"),
    schema: await import("@/lib/db/schema"),
    orm: await import("drizzle-orm"),
    checkout: await import("./checkout"),
    actions: await import("@/app/app/settings/billing/actions"),
    pricing: await import("./pricing"),
    provider: (await import("./provider")) as Mods["provider"],
    action: await import("@/lib/action"),
    helpers: await import("../../../test/pglite-db"),
  };
  await m.helpers.migrateTestDb(m.dbm.db);
  await m.helpers.seedTestPlans(m.dbm.db);
});

afterAll(async () => {
  if (m) await m.helpers.closeTestDb(m.dbm.db);
});

beforeEach(async () => {
  const id = `buyer-${++seq}`;
  state.user = { id, name: "Adv. Meera Iyer", email: `${id}@example.test`, role: "user" };
  state.configured = true;
  state.revalidated = [];
  state.calls = [];
  state.mode = "redirect";
  await m.dbm.db.insert(m.schema.user).values({ id, name: state.user.name, email: state.user.email, emailVerified: true });
});

async function myPayments() {
  const { eq, asc } = m.orm;
  return m.dbm.db.select().from(m.schema.payments).where(eq(m.schema.payments.userId, state.user!.id)).orderBy(asc(m.schema.payments.createdAt));
}

function begin(planId: string, interval: string, now?: Date) {
  return m.checkout.beginCheckout({
    user: state.user!,
    planId,
    interval,
    mobile: "9876543210",
    provider: m.provider.fakeProvider,
    returnUrl: (o) => `http://localhost:3000/app/settings/billing?order=${o}`,
    now,
  });
}

describe("beginCheckout", () => {
  it("creates one pending payment for the catalogue amount", async () => {
    const r = await begin("pro", "year");
    const charge = m.pricing.chargeFor("pro", "year");
    expect(r).toMatchObject({ reused: false, amountPaise: charge.totalPaise, redirectUrl: `https://pay.example/checkout/${r.orderId}`, upiIntent: null });
    expect(state.calls).toEqual([expect.objectContaining({ orderId: r.orderId, amountPaise: charge.totalPaise, payerMobile: "9876543210" })]);
    const [p] = await myPayments();
    expect(p).toMatchObject({ id: r.paymentId, planId: "pro", interval: "year", amountPaise: charge.totalPaise, status: "created", provider: "fakepay", providerOrderId: r.orderId });
  });

  it("refuses plans and intervals outside the catalogue", async () => {
    for (const [plan, interval] of [
      ["free", "month"],
      ["enterprise", "month"],
      ["constructor", "month"],
      ["pro", "week"],
      ["pro", ""],
    ]) {
      await expect(begin(plan, interval), `${plan}/${interval}`).rejects.toThrow(m.action.ActionError);
    }
    expect(state.calls).toEqual([]);
    expect(await myPayments()).toEqual([]);
  });

  it("hands back a recent pending payment for the same plan instead of a duplicate", async () => {
    state.mode = "upi";
    const t0 = new Date();
    const first = await begin("updates", "month", t0);
    const again = await begin("updates", "month", new Date(t0.getTime() + 3 * 60_000));
    expect(again).toMatchObject({ reused: true, paymentId: first.paymentId, orderId: first.orderId, upiIntent: first.upiIntent, redirectUrl: null });
    expect(state.calls).toHaveLength(1);
    expect(await myPayments()).toHaveLength(1);
    const [p] = await myPayments();
    expect(p.providerPaymentId).toBe(`TXN-${first.orderId}`);
  });

  it("starts a new payment for another plan or interval, or after the reuse window", async () => {
    const t0 = new Date();
    const a = await begin("pro", "month", t0);
    const b = await begin("pro", "year", t0);
    const c = await begin("chambers", "month", t0);
    const d = await begin("pro", "month", new Date(t0.getTime() + (m.checkout.CHECKOUT_REUSE_MINUTES + 1) * 60_000));
    expect(new Set([a.orderId, b.orderId, c.orderId, d.orderId]).size).toBe(4);
    expect([a, b, c, d].map((r) => r.reused)).toEqual([false, false, false, false]);
    expect(await myPayments()).toHaveLength(4);
  });

  it("never reuses a payment that is no longer pending", async () => {
    const first = await begin("pro", "month");
    await m.dbm.db.update(m.schema.payments).set({ status: "paid", paidAt: new Date() }).where(m.orm.eq(m.schema.payments.id, first.paymentId));
    const next = await begin("pro", "month");
    expect(next.reused).toBe(false);
    expect(next.orderId).not.toBe(first.orderId);
  });

  it("does not open a second order while the first is still being set up", async () => {
    const t0 = new Date();
    // A pending row with no recorded link yet: a provider call still in flight.
    await m.dbm.db.insert(m.schema.payments).values({
      userId: state.user!.id,
      planId: "pro",
      interval: "month",
      amountPaise: m.pricing.chargeFor("pro", "month").totalPaise,
      provider: "fakepay",
      providerOrderId: `INFLIGHT${seq}`,
      status: "created",
      createdAt: t0,
    });
    await expect(begin("pro", "month", new Date(t0.getTime() + 5_000))).rejects.toThrow(/already being set up/);
    expect(state.calls).toEqual([]);
    // Once it is clearly stuck (no link after the in-flight window), a fresh order is allowed.
    const later = await begin("pro", "month", new Date(t0.getTime() + (m.checkout.CHECKOUT_IN_FLIGHT_SECONDS + 5) * 1000));
    expect(later.reused).toBe(false);
  });

  it("serialises concurrent clicks into one order", async () => {
    const results = await Promise.allSettled([begin("pro", "month"), begin("pro", "month"), begin("pro", "month")]);
    const orders = new Set(results.flatMap((r) => (r.status === "fulfilled" ? [r.value.orderId] : [])));
    expect(orders.size).toBe(1);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason)).toMatch(/already being set up/);
    expect(state.calls).toHaveLength(1);
    expect(await myPayments()).toHaveLength(1);
  });

  it("marks the payment failed when the provider refuses, and the next try starts fresh", async () => {
    state.mode = "reject";
    await expect(begin("pro", "month")).rejects.toThrow(m.provider.PaymentProviderError);
    state.mode = "crash";
    await expect(begin("pro", "month")).rejects.toThrow(/socket hang up/);
    state.mode = "nolink";
    await expect(begin("pro", "month")).rejects.toThrow(/did not return a payment link/);
    expect((await myPayments()).map((p) => p.status)).toEqual(["failed", "failed", "failed"]);
    state.mode = "redirect";
    expect((await begin("pro", "month")).reused).toBe(false);
  });
});

describe("startCheckout action", () => {
  it("refuses signed-out users and unconfigured payments", async () => {
    const me = state.user;
    state.user = null;
    expect(await m.actions.startCheckout({ planId: "pro", interval: "month", mobile: "9876543210" })).toEqual({ ok: false, error: "Please sign in." });
    state.user = me;
    state.configured = false;
    expect(await m.actions.startCheckout({ planId: "pro", interval: "month", mobile: "9876543210" })).toEqual({
      ok: false,
      error: "Online payments are not configured yet.",
    });
    expect(state.calls).toEqual([]);
  });

  it("validates the plan, interval and mobile number", async () => {
    const free = await m.actions.startCheckout({ planId: "free" as "pro", interval: "month", mobile: "9876543210" });
    expect(free.ok).toBe(false);
    if (!free.ok) expect(free.fieldErrors?.planId).toBeTruthy();
    const week = await m.actions.startCheckout({ planId: "pro", interval: "week" as "month", mobile: "9876543210" });
    expect(week.ok).toBe(false);
    if (!week.ok) expect(week.fieldErrors?.interval).toBeTruthy();
    const phone = await m.actions.startCheckout({ planId: "pro", interval: "month", mobile: "12345" });
    expect(phone.ok).toBe(false);
    if (!phone.ok) expect(phone.fieldErrors?.mobile).toBe("Enter a 10-digit Indian mobile number.");
    expect(state.calls).toEqual([]);
  });

  it("returns the payment link and keeps the result shape", async () => {
    const res = await m.actions.startCheckout({ planId: "chambers", interval: "year", mobile: "+91 98765-43210" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.data).sort()).toEqual(["orderId", "redirectUrl", "upiIntent"]);
    expect(res.data.redirectUrl).toBe(`https://pay.example/checkout/${res.data.orderId}`);
    expect(state.calls[0]).toMatchObject({ payerMobile: "9876543210", amountPaise: m.pricing.chargeFor("chambers", "year").totalPaise });
    expect(state.calls[0].returnUrl).toContain(`order=${res.data.orderId}`);
    expect(state.revalidated).toContain("/app/settings/billing");
    // Clicking again returns the same order.
    const again = await m.actions.startCheckout({ planId: "chambers", interval: "year", mobile: "9876543210" });
    expect(again).toEqual(res);
    const audit = await m.dbm.db.select().from(m.schema.auditEvents).where(m.orm.eq(m.schema.auditEvents.entityType, "payment"));
    const mine = audit.filter((a) => a.actorId === state.user!.id).map((a) => a.action);
    expect(mine).toEqual(expect.arrayContaining(["billing.checkout_started", "billing.checkout_resumed"]));
  });

  it("shows provider refusals as messages and hides internal errors", async () => {
    state.mode = "reject";
    expect(await m.actions.startCheckout({ planId: "pro", interval: "month", mobile: "9876543210" })).toEqual({
      ok: false,
      error: "The payment provider could not start this payment.",
    });
    state.mode = "crash";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await m.actions.startCheckout({ planId: "pro", interval: "month", mobile: "9876543210" })).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    err.mockRestore();
  });

  it("rate-limits checkout attempts per user", async () => {
    state.mode = "reject";
    for (let i = 0; i < 5; i++) await m.actions.startCheckout({ planId: "pro", interval: "month", mobile: "9876543210" });
    const sixth = await m.actions.startCheckout({ planId: "pro", interval: "month", mobile: "9876543210" });
    expect(sixth).toEqual({ ok: false, error: "Too many requests. Please wait a moment and try again." });
    expect(state.calls).toHaveLength(5);
  });
});
