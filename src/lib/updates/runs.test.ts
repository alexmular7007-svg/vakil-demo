// The one-sync-at-a-time rule and run bookkeeping against an in-memory PostgreSQL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/db", async () => (await import("../../../test/pglite-db")).mockDbModule());

const { db, __pg: pg } = (await import("@/lib/db")) as unknown as import("../../../test/pglite-db").TestDbModule;
const { syncRuns } = await import("@/lib/db/schema");
const { claimLegalUpdatesSync, claimRuns, describeRunning, releaseAllLeases, STALE_RUN_MESSAGE } = await import("./runs");

const row = async (id: string) => (await db.select().from(syncRuns).where(eq(syncRuns.id, id)))[0];

beforeEach(async () => {
  await releaseAllLeases("test cleanup");
  await pg.exec("delete from corpus.sync_runs");
});

describe("claimLegalUpdatesSync", () => {
  it("lets one caller in and tells the next one what is running", async () => {
    const first = await claimLegalUpdatesSync(["feeds", "india_code"], "cron");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await claimLegalUpdatesSync(["feeds"], "admin");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.running).toMatchObject({ kind: "feeds", trigger: "cron", runId: first.lease.ids.feeds });
    expect(describeRunning(second.running)).toMatch(/^A legal-updates sync is already running \(feeds, started less than a minute ago by cron\)\.$/);

    // Still locked while India Code runs after the feeds finished…
    await first.lease.finish("feeds", "ok", { trigger: "cron" }, null);
    await first.lease.begin("india_code");
    expect((await claimLegalUpdatesSync(["india_code"], "local")).ok).toBe(false);
    // …and free once everything has finished.
    await first.lease.finish("india_code", "partial", { trigger: "cron" }, "one act failed");
    expect(first.lease.done).toBe(true);
    const third = await claimLegalUpdatesSync(["feeds"], "local");
    expect(third.ok).toBe(true);
    if (third.ok) await third.lease.release("test");
  });

  it("creates the later part queued and starts its clock when it begins", async () => {
    const c = await claimLegalUpdatesSync(["feeds", "india_code"], "script");
    if (!c.ok) throw new Error("claim failed");
    const ic = await row(c.lease.ids.india_code!);
    expect(ic.summary).toMatchObject({ trigger: "script", queued: true });
    await c.lease.begin("india_code");
    const after = await row(c.lease.ids.india_code!);
    expect(after.summary).not.toHaveProperty("queued");
    expect(after.status).toBe("running");
    await c.lease.release("test");
    expect((await row(c.lease.ids.india_code!)).status).toBe("failed");
  });

  it("closes a run with no sign of life for 30 minutes and lets the next caller in", async () => {
    const old = new Date(Date.now() - 31 * 60_000);
    const [dead] = await db.insert(syncRuns).values({ kind: "india_code", status: "running", startedAt: old, summary: { trigger: "cron", heartbeatAt: old.toISOString() } }).returning();
    const c = await claimLegalUpdatesSync(["feeds"], "admin");
    expect(c.ok).toBe(true);
    expect(c.closedStale).toBe(1);
    expect(await row(dead.id)).toMatchObject({ status: "failed", error: STALE_RUN_MESSAGE });
    if (c.ok) await c.lease.release("test");
  });

  it("keeps a long run alive with its heartbeat", async () => {
    const c = await claimLegalUpdatesSync(["feeds"], "script");
    if (!c.ok) throw new Error("claim failed");
    // Pretend the run started long ago but is still beating.
    await db.update(syncRuns).set({ startedAt: new Date(Date.now() - 60 * 60_000) }).where(eq(syncRuns.id, c.lease.ids.feeds!));
    await c.lease.heartbeat();
    expect((await row(c.lease.ids.feeds!)).summary).toHaveProperty("heartbeatAt");
    expect((await claimLegalUpdatesSync(["feeds"], "admin")).ok).toBe(false);
    await c.lease.release("test");
  });
});

describe("claimRuns without exclusivity", () => {
  it("records parallel imports, closing stale ones", async () => {
    const old = new Date(Date.now() - 45 * 60_000);
    const [dead] = await db.insert(syncRuns).values({ kind: "judgments", status: "running", startedAt: old, summary: {} }).returning();
    const a = await claimRuns(["judgments"], { trigger: "script", summary: { court: "sc" } });
    const b = await claimRuns(["judgments"], { trigger: "script", summary: { court: "hc" } });
    expect(a.ok && b.ok).toBe(true);
    expect(a.closedStale).toBe(1);
    expect((await row(dead.id)).status).toBe("failed");
    const ids = [a, b].flatMap((c) => (c.ok ? [c.lease.ids.judgments!] : []));
    expect((await db.select().from(syncRuns).where(inArray(syncRuns.id, ids))).map((r) => r.status)).toEqual(["running", "running"]);
    await releaseAllLeases("test");
    expect((await db.select().from(syncRuns).where(inArray(syncRuns.id, ids))).every((r) => r.status === "failed" && r.error === "test")).toBe(true);
  });
});
