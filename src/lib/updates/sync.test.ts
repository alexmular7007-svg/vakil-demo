// The legal-updates job end to end against an in-memory PostgreSQL, with the network
// replaced by recorded responses: retries for transient errors, no retry for a 403,
// sources switched off by DISABLED_UPDATE_SOURCES, per-source health across runs, and
// one sync at a time.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.setConfig({ testTimeout: 30_000 });

const state = vi.hoisted(() => ({ disabled: "prs-billtrack,india_code" as string | undefined, extra: undefined as string | undefined }));
vi.mock("@/lib/env", () => ({
  env: {
    get DISABLED_UPDATE_SOURCES() {
      return state.disabled;
    },
    get EXTRA_UPDATE_FEEDS() {
      return state.extra;
    },
  },
  features: {},
}));
vi.mock("@/lib/db", async () => (await import("../../../test/pglite-db")).mockDbModule());

const { db, __pg: pg } = (await import("@/lib/db")) as unknown as import("../../../test/pglite-db").TestDbModule;
const { legalUpdates, syncRuns } = await import("@/lib/db/schema");
const { activeSources, syncLegalUpdates } = await import("./sync");
const { STALE_RUN_MESSAGE } = await import("./runs");

const fixture = (name: string) => readFileSync(path.resolve(process.cwd(), "test/fixtures/updates", name), "utf8");
const calls: Record<string, number> = {};
let gate: Promise<void> | null = null;
let reached: (() => void) | null = null;

function respond(url: string): Response {
  const host = new URL(url).hostname;
  calls[host] = (calls[host] ?? 0) + 1;
  if (host === "sansad.in") return new Response(fixture("sansad-bills.json"), { headers: { "content-type": "application/json" } });
  // Indian Kanoon fails once with a 503 (transient), then answers.
  if (host === "indiankanoon.org") return calls[host] % 2 === 1 ? new Response("busy", { status: 503 }) : new Response(fixture("indiankanoon-sc.rss.xml"));
  // SCC Online refuses automated clients: permanent, never retried.
  if (host === "www.scconline.com") return new Response("denied", { status: 403 });
  return new Response("not found", { status: 404 });
}

vi.stubGlobal("fetch", async (input: string | URL) => {
  const url = String(input);
  if (gate) {
    reached?.();
    await gate;
  }
  return respond(url);
});
vi.spyOn(Math, "random").mockReturnValue(0); // shortest backoff

afterAll(() => vi.unstubAllGlobals());

beforeEach(async () => {
  for (const k of Object.keys(calls)) delete calls[k];
  await pg.exec("delete from corpus.sync_runs; delete from corpus.legal_updates;");
});

describe("syncLegalUpdates", () => {
  it("skips switched-off sources, retries transient errors, and records each source's health", async () => {
    expect(activeSources().find((s) => s.key === "prs-billtrack")).toMatchObject({ enabled: false, disabledBy: "env" });

    const summary = await syncLegalUpdates({ trigger: "cron" });
    expect(summary.skipped).toContain("india_code (disabled)");
    expect(summary.disabled).toEqual(expect.arrayContaining(["india_code", "prs-billtrack", "barandbench"]));
    expect(summary.indiaCode).toBeUndefined();
    const s = summary.feeds!.sources;
    expect(Object.keys(s).sort()).toEqual(["indiankanoon-sc", "sansad-bills", "scc-times"]);
    expect(s["indiankanoon-sc"]).toMatchObject({ ok: true, attempts: 2 });
    expect(s["indiankanoon-sc"].fetched).toBeGreaterThan(0);
    expect(s["scc-times"]).toMatchObject({ ok: false, attempts: 1, error: "HTTP 403", health: { consecutiveFailures: 1, lastSuccessAt: null } });
    expect(s["sansad-bills"].health).toMatchObject({ consecutiveFailures: 0 });
    expect(s["sansad-bills"].health?.lastSuccessAt).toMatch(/^\d{4}-/);
    expect(calls["prsindia.org"]).toBeUndefined();
    expect(summary.feeds!.status).toBe("partial");

    const [run] = await db.select().from(syncRuns).where(eq(syncRuns.kind, "feeds"));
    expect(run).toMatchObject({ status: "partial", error: "scc-times: HTTP 403" });
    expect((run.summary as { disabled: string[] }).disabled).toContain("prs-billtrack");
    const stored = await db.select().from(legalUpdates);
    expect(stored.length).toBe(s["sansad-bills"].new + s["indiankanoon-sc"].new);

    // The next run continues the count.
    const again = await syncLegalUpdates({ trigger: "cron" });
    expect(again.feeds!.sources["scc-times"].health).toMatchObject({ consecutiveFailures: 2 });
    expect(again.feeds!.sources["indiankanoon-sc"].health).toMatchObject({ consecutiveFailures: 0 });
    expect(again.feeds!.sources["sansad-bills"].new).toBe(0);
  });

  it("runs one sync at a time: a second caller gets 'already running' and does nothing", async () => {
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    const firstFetch = new Promise<void>((r) => (reached = r));
    const first = syncLegalUpdates({ trigger: "cron" });
    await firstFetch; // the first sync holds the lock and is fetching

    const second = await syncLegalUpdates({ trigger: "admin" });
    expect(second.alreadyRunning).toMatchObject({ kind: "feeds", trigger: "cron" });
    expect(second.alreadyRunning?.message).toMatch(/already running/);
    expect(second.feeds).toBeUndefined();
    expect(second.skipped).toEqual(["india_code (disabled)", "feeds (already running)"]);

    gate = null;
    open();
    const done = await first;
    expect(done.feeds?.status).toBe("partial");
    expect((await db.select().from(syncRuns)).filter((r) => r.status === "running")).toEqual([]);
    // Free again.
    expect((await syncLegalUpdates({ trigger: "admin" })).alreadyRunning).toBeUndefined();
  });

  it("closes a run stuck in 'running' for over 30 minutes and goes ahead", async () => {
    const old = new Date(Date.now() - 40 * 60_000);
    const [stuck] = await db.insert(syncRuns).values({ kind: "feeds", status: "running", startedAt: old, summary: { trigger: "cron" } }).returning();
    const summary = await syncLegalUpdates({ trigger: "local" });
    expect(summary.alreadyRunning).toBeUndefined();
    const [row] = await db.select().from(syncRuns).where(eq(syncRuns.id, stuck.id));
    expect(row).toMatchObject({ status: "failed", error: STALE_RUN_MESSAGE });
  });

  it("does nothing when every part is switched off", async () => {
    state.disabled = "india_code";
    try {
      const summary = await syncLegalUpdates({ only: "india_code", trigger: "cron" });
      expect(summary).toMatchObject({ skipped: ["india_code (disabled)"], disabled: ["india_code"] });
      expect(await db.select().from(syncRuns)).toEqual([]);
    } finally {
      state.disabled = "prs-billtrack,india_code";
    }
  });
});
