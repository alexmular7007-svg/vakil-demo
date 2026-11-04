// Feature access against an isolated in-memory PGlite (every migration +
// security.sql): automatic trials, expiry exactly at periodEnd, cancelled and
// past-due plans, admins, and that the browser's role (app_user) cannot create,
// extend or delete trials or subscriptions.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

delete process.env.DATABASE_URL;
// The in-memory database is slow on a busy machine; give each case room.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });
vi.mock("@/lib/db", async () => (await import("../../../test/pglite-db")).createTestDbModule());

type Mods = {
  dbm: typeof import("@/lib/db");
  schema: typeof import("@/lib/db/schema");
  orm: typeof import("drizzle-orm");
  ent: typeof import("./entitlements");
  helpers: typeof import("../../../test/pglite-db");
};
let m: Mods;

const DAY = 86_400_000;
const T0 = new Date("2026-11-03T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
let seq = 0;
let user = { id: "", role: "user" as string | null };

beforeAll(async () => {
  m = {
    dbm: await import("@/lib/db"),
    schema: await import("@/lib/db/schema"),
    orm: await import("drizzle-orm"),
    ent: await import("./entitlements"),
    helpers: await import("../../../test/pglite-db"),
  };
  await m.helpers.migrateTestDb(m.dbm.db);
  await m.helpers.seedTestPlans(m.dbm.db);
});

afterAll(async () => {
  if (m) await m.helpers.closeTestDb(m.dbm.db);
});

beforeEach(async () => {
  user = { id: `ent-${++seq}`, role: "user" };
  await m.dbm.db.insert(m.schema.user).values({
    id: user.id,
    name: user.id,
    email: `${user.id}@example.test`,
    emailVerified: true,
  });
});

async function subscribe(planId: string, periodEnd: Date, status = "active") {
  await m.dbm.db.insert(m.schema.subscriptions).values({
    userId: user.id,
    planId,
    status,
    interval: "month",
    periodStart: new Date(periodEnd.getTime() - 30 * DAY),
    periodEnd,
    provider: "cgpey",
  });
}
async function trialRows() {
  return m.dbm.db.select().from(m.schema.featureTrials).where(m.orm.eq(m.schema.featureTrials.userId, user.id));
}
const access = (now: Date) => m.ent.getFeatureAccess(user, "legal_updates", { now });

describe("getFeatureAccess", () => {
  it("starts the trial on first check and never extends it", async () => {
    const first = await access(T0);
    expect(first).toEqual({
      status: "trial",
      trialEndsAt: at(15 * DAY),
      daysLeft: 15,
    });
    expect(await trialRows()).toHaveLength(1);
    // Later checks see the same end date.
    expect(await access(at(10 * DAY))).toEqual({
      status: "trial",
      trialEndsAt: at(15 * DAY),
      daysLeft: 5,
    });
    // At and after the end: expired, and no new trial is started.
    expect(await access(at(15 * DAY))).toEqual({
      status: "expired",
      trialEndedAt: at(15 * DAY),
    });
    expect(await access(at(400 * DAY))).toEqual({
      status: "expired",
      trialEndedAt: at(15 * DAY),
    });
    const rows = await trialRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].endsAt).toEqual(at(15 * DAY));
  });

  it("starts exactly one trial when checked concurrently", async () => {
    const results = await Promise.all([access(T0), access(T0), access(T0)]);
    for (const r of results)
      expect(r).toEqual({
        status: "trial",
        trialEndsAt: at(15 * DAY),
        daysLeft: 15,
      });
    expect(await trialRows()).toHaveLength(1);
  });

  it("grants access through an including plan until exactly periodEnd", async () => {
    await access(T0); // trial starts on day 0
    await subscribe("pro", at(40 * DAY));
    expect(await access(at(20 * DAY))).toEqual({
      status: "paid",
      via: "pro",
      until: at(40 * DAY),
    });
    expect(await access(at(40 * DAY - 1))).toMatchObject({
      status: "paid",
      via: "pro",
    });
    // At periodEnd the plan stops; the old trial is long over.
    expect(await access(at(40 * DAY))).toEqual({
      status: "expired",
      trialEndedAt: at(15 * DAY),
    });
  });

  it("uses the subscription that ends last, add-on included", async () => {
    await subscribe("pro", at(5 * DAY));
    await subscribe("updates", at(90 * DAY));
    expect(await access(T0)).toEqual({
      status: "paid",
      via: "updates",
      until: at(90 * DAY),
    });
    expect(await trialRows()).toHaveLength(0);
  });

  it("ignores cancelled and past-due subscriptions and plans without the feature", async () => {
    await subscribe("pro", at(30 * DAY), "cancelled");
    await subscribe("chambers", at(30 * DAY), "past_due");
    await subscribe("free", at(30 * DAY));
    expect((await access(T0)).status).toBe("trial");
  });

  it("does not count another user's subscription", async () => {
    const other = `${user.id}-other`;
    await m.dbm.db.insert(m.schema.user).values({
      id: other,
      name: other,
      email: `${other}@example.test`,
      emailVerified: true,
    });
    await m.dbm.db.insert(m.schema.subscriptions).values({
      userId: other,
      planId: "pro",
      status: "active",
      interval: "month",
      periodStart: T0,
      periodEnd: at(30 * DAY),
      provider: "cgpey",
    });
    expect((await access(T0)).status).toBe("trial");
  });

  it("always gives admins access, without starting a trial", async () => {
    user.role = "admin";
    expect(await access(T0)).toEqual({
      status: "paid",
      via: "admin",
      until: null,
    });
    expect(await m.ent.getUpdatesAccess(user)).toEqual({
      status: "paid",
      via: "admin",
      until: null,
    });
    expect(await trialRows()).toHaveLength(0);
    // Unknown or missing roles are treated as ordinary users.
    user.role = "superuser";
    expect((await access(T0)).status).toBe("trial");
    user.role = null;
    expect((await access(T0)).status).toBe("trial");
  });
});

describe("getUpdatesAccess / hasUpdatesAccess wrappers", () => {
  it("keep the original shapes", async () => {
    const trial = await m.ent.getUpdatesAccess(user);
    expect(trial.status).toBe("trial");
    expect(m.ent.hasUpdatesAccess(trial)).toBe(true);
    expect(m.ent.hasUpdatesAccess({ status: "expired", trialEndedAt: T0 })).toBe(false);
    expect(m.ent.hasUpdatesAccess({ status: "paid", via: "chambers", until: null })).toBe(true);
    expect(m.ent.hasFeature({ status: "locked" })).toBe(false);
  });
});

describe("browser role cannot change billing state", () => {
  // withUser() is exactly what every server action runs user writes through.
  const asUser = <T>(fn: (tx: import("@/lib/db").Tx) => Promise<T>) => m.dbm.withUser(user.id, fn);
  /** Drizzle wraps the Postgres error; 42501 = insufficient_privilege. */
  async function denied(p: Promise<unknown>) {
    const err = await p.then(
      () => null,
      (e: unknown) =>
        e as {
          code?: string;
          message?: string;
          cause?: { code?: string; message?: string };
        },
    );
    expect(err, "expected the write to be refused").not.toBeNull();
    expect(err?.cause?.code ?? err?.code).toBe("42501");
    expect(err?.cause?.message ?? err?.message).toMatch(/permission denied/);
  }

  it("cannot extend, create or delete a trial", async () => {
    await access(T0);
    const { featureTrials } = m.schema;
    const { eq, sql } = m.orm;
    await denied(
      asUser((tx) =>
        tx
          .update(featureTrials)
          .set({ endsAt: at(999 * DAY) })
          .where(eq(featureTrials.userId, user.id)),
      ),
    );
    await denied(asUser((tx) => tx.delete(featureTrials).where(eq(featureTrials.userId, user.id))));
    await denied(
      asUser((tx) =>
        tx.insert(featureTrials).values({
          userId: user.id,
          feature: "other_feature",
          startedAt: T0,
          endsAt: at(999 * DAY),
        }),
      ),
    );
    await denied(asUser((tx) => tx.execute(sql`truncate billing.feature_trials`)));
    // Reading their own trial is allowed (and only their own).
    const own = await asUser((tx) => tx.select().from(featureTrials));
    expect(own.map((r) => r.userId)).toEqual([user.id]);
    expect((await trialRows())[0].endsAt).toEqual(at(15 * DAY));
  });

  it("cannot grant itself a subscription or mark a payment paid", async () => {
    const { subscriptions, payments } = m.schema;
    await denied(
      asUser((tx) =>
        tx.insert(subscriptions).values({
          userId: user.id,
          planId: "pro",
          status: "active",
          interval: "year",
          periodStart: T0,
          periodEnd: at(365 * DAY),
          provider: "x",
        }),
      ),
    );
    await denied(
      asUser((tx) =>
        tx.insert(payments).values({
          userId: user.id,
          planId: "pro",
          interval: "month",
          amountPaise: 1,
          provider: "x",
          status: "paid",
        }),
      ),
    );
    expect((await access(T0)).status).toBe("trial");
  });
});
