import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { syncRuns } from "@/lib/db/schema";
import type { SYNC_KINDS, SYNC_STATUSES } from "@/lib/db/schema/enums";
import { HEARTBEAT_MS, isStaleRun, STALE_RUN_MS } from "./health";

// Run bookkeeping in corpus.sync_runs, and the "one sync at a time" rule.
//
// A claim runs in a short transaction holding a transaction advisory lock, so two
// callers (cron, the admin "Sync now" button, the local scheduler, a script) can never
// both see "nothing running" and start. The "running" rows it inserts are the lease:
// while one is live, the next caller gets "already running". A live run refreshes a
// heartbeat in its summary every 2 minutes; a row with no start or heartbeat for 30
// minutes (process killed, function timed out) is stale and is closed as failed.
// No database connection is held between claim and finish, so this works through the
// Supabase transaction pooler and with the embedded PGlite database alike.

export type RunKind = (typeof SYNC_KINDS)[number];
export type RunStatus = Exclude<(typeof SYNC_STATUSES)[number], "running">;

/** Advisory lock key serialising claims of the legal-updates sync (feeds + India Code). */
export const LEGAL_UPDATES_LOCK = "vaakil:legal-updates-sync";
export const LEGAL_UPDATES_KINDS = ["feeds", "india_code"] as const satisfies readonly RunKind[];

export const STALE_RUN_MESSAGE = `Did not finish: no sign of life for ${STALE_RUN_MS / 60_000} minutes (process stopped or timed out).`;

export type RunningSync = { runId: string; kind: string; startedAt: Date; trigger: string | null };

const ACTIVE = new Set<RunLease>();

/** The rows one caller is running, with their heartbeat. */
export class RunLease {
  readonly ids: Partial<Record<RunKind, string>>;
  private open: Set<string>;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(rows: { id: string; kind: string }[]) {
    this.ids = Object.fromEntries(rows.map((r) => [r.kind, r.id])) as Partial<Record<RunKind, string>>;
    this.open = new Set(rows.map((r) => r.id));
    ACTIVE.add(this);
    this.timer = setInterval(() => void this.heartbeat().catch(() => {}), HEARTBEAT_MS);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Records a sign of life on every open row. */
  async heartbeat(at = new Date()): Promise<void> {
    const ids = [...this.open];
    if (!ids.length) return;
    await db
      .update(syncRuns)
      .set({ summary: sql`coalesce(${syncRuns.summary}, '{}'::jsonb) || jsonb_build_object('heartbeatAt', ${at.toISOString()}::text)` })
      .where(and(inArray(syncRuns.id, ids), eq(syncRuns.status, "running")));
  }

  /** Marks a queued part as started now (its row was created with the claim). */
  async begin(kind: RunKind): Promise<void> {
    const id = this.ids[kind];
    if (!id || !this.open.has(id)) return;
    await db
      .update(syncRuns)
      .set({
        startedAt: sql`now()`,
        summary: sql`(coalesce(${syncRuns.summary}, '{}'::jsonb) - 'queued') || jsonb_build_object('heartbeatAt', ${new Date().toISOString()}::text)`,
      })
      .where(and(eq(syncRuns.id, id), eq(syncRuns.status, "running")));
  }

  async finish(kind: RunKind, status: RunStatus, summary: Record<string, unknown>, error: string | null): Promise<void> {
    const id = this.ids[kind];
    if (!id || !this.open.has(id)) return;
    await db
      .update(syncRuns)
      .set({ status, finishedAt: sql`now()`, summary, error: error ? error.slice(0, 2000) : null })
      .where(eq(syncRuns.id, id));
    this.open.delete(id);
    if (!this.open.size) this.stop();
  }

  /** Closes every row still open as failed (a part that never ran, or an unexpected error). */
  async release(reason: string): Promise<void> {
    const ids = [...this.open];
    this.open.clear();
    this.stop();
    if (!ids.length) return;
    await db
      .update(syncRuns)
      .set({ status: "failed", finishedAt: sql`now()`, error: reason.slice(0, 2000) })
      .where(and(inArray(syncRuns.id, ids), eq(syncRuns.status, "running")));
  }

  get done(): boolean {
    return this.open.size === 0;
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.open.size) ACTIVE.delete(this);
  }
}

export type ClaimResult = { ok: true; lease: RunLease; closedStale: number } | { ok: false; running: RunningSync; closedStale: number };

/**
 * Inserts "running" rows for `kinds` (the first one started, the rest queued). With
 * `exclusive`, refuses while any non-stale row of the given kinds is running. Stale
 * rows of those kinds are closed either way.
 */
export async function claimRuns(
  kinds: readonly RunKind[],
  opts: { trigger: string; summary?: Record<string, unknown>; exclusive?: { lockKey: string; scope: readonly RunKind[] }; now?: Date },
): Promise<ClaimResult> {
  if (!kinds.length) throw new Error("claimRuns needs at least one kind");
  const scope = opts.exclusive?.scope ?? kinds;
  return db.transaction(async (t) => {
    const tx = t as unknown as Tx;
    if (opts.exclusive) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${opts.exclusive.lockKey}))`);
    const now = opts.now ?? new Date();
    const running = await tx
      .select({ id: syncRuns.id, kind: syncRuns.kind, startedAt: syncRuns.startedAt, summary: syncRuns.summary })
      .from(syncRuns)
      .where(and(inArray(syncRuns.kind, [...scope]), eq(syncRuns.status, "running")));
    const stale = running.filter((r) => isStaleRun(r, now));
    if (stale.length) {
      await tx
        .update(syncRuns)
        .set({ status: "failed", finishedAt: sql`now()`, error: STALE_RUN_MESSAGE })
        .where(inArray(syncRuns.id, stale.map((r) => r.id)));
    }
    const live = running.filter((r) => !isStaleRun(r, now)).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    if (opts.exclusive && live.length) {
      const r = live[0];
      const trigger = (r.summary as { trigger?: unknown } | null)?.trigger;
      return { ok: false, running: { runId: r.id, kind: r.kind, startedAt: r.startedAt, trigger: typeof trigger === "string" ? trigger : null }, closedStale: stale.length };
    }
    const heartbeatAt = now.toISOString();
    const rows = await tx
      .insert(syncRuns)
      .values(kinds.map((kind, i) => ({ kind, status: "running", summary: { trigger: opts.trigger, ...opts.summary, heartbeatAt, ...(i > 0 ? { queued: true } : {}) } })))
      .returning({ id: syncRuns.id, kind: syncRuns.kind });
    // Keep the claim order (feeds before India Code).
    rows.sort((a, b) => kinds.indexOf(a.kind as RunKind) - kinds.indexOf(b.kind as RunKind));
    return { ok: true, lease: new RunLease(rows), closedStale: stale.length };
  });
}

/** The legal-updates sync: one at a time across feeds and India Code. */
export function claimLegalUpdatesSync(parts: readonly ("feeds" | "india_code")[], trigger: string, now?: Date): Promise<ClaimResult> {
  return claimRuns(parts, { trigger, now, exclusive: { lockKey: LEGAL_UPDATES_LOCK, scope: LEGAL_UPDATES_KINDS } });
}

/** Closes the rows of every lease this process holds (for signal handlers in scripts). */
export async function releaseAllLeases(reason: string): Promise<void> {
  await Promise.all([...ACTIVE].map((l) => l.release(reason).catch(() => {})));
}

/** "a sync is already running (feeds, started 3 min ago by admin)". */
export function describeRunning(r: RunningSync, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - r.startedAt.getTime()) / 60_000));
  const ago = mins < 1 ? "less than a minute ago" : mins === 1 ? "1 minute ago" : `${mins} minutes ago`;
  const part = r.kind === "india_code" ? "India Code check" : r.kind === "feeds" ? "feeds" : r.kind;
  return `A legal-updates sync is already running (${part}, started ${ago}${r.trigger ? ` by ${r.trigger}` : ""}).`;
}
