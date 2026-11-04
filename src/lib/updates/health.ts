// Health of each legal-updates source across runs (consecutive failures, last
// success), and when a "running" sync_runs row counts as stale. Recorded in every
// run's summary and shown on /admin/updates. Pure functions, safe for client and server.

export type SourceHealth = {
  /** Failed runs in a row, 0 after a success. */
  consecutiveFailures: number;
  /** ISO time of the last successful read, if any is known. */
  lastSuccessAt: string | null;
  /** ISO time of the last failure, if any is known. */
  lastFailureAt: string | null;
  lastError: string | null;
};

export const EMPTY_HEALTH: SourceHealth = { consecutiveFailures: 0, lastSuccessAt: null, lastFailureAt: null, lastError: null };

/** Health after one more run of the source. */
export function nextHealth(prev: SourceHealth | null | undefined, outcome: { ok: boolean; at: Date; error?: string | null }): SourceHealth {
  const p = prev ?? EMPTY_HEALTH;
  const at = outcome.at.toISOString();
  return outcome.ok
    ? { consecutiveFailures: 0, lastSuccessAt: at, lastFailureAt: p.lastFailureAt, lastError: null }
    : { consecutiveFailures: p.consecutiveFailures + 1, lastSuccessAt: p.lastSuccessAt, lastFailureAt: at, lastError: (outcome.error ?? "failed").slice(0, 300) };
}

/** One past run of a source, newest first; `health` is present on runs recorded since health tracking began. */
export type SourceRunRecord = { ok: boolean; at: Date; error?: string | null; health?: SourceHealth | null };

/**
 * The health a source had after its latest run. Uses the stored health when the latest
 * run recorded one; for older runs it is rebuilt by counting failures back to the last success.
 */
export function healthFromHistory(history: readonly SourceRunRecord[]): SourceHealth | null {
  if (!history.length) return null;
  if (history[0].health) return history[0].health;
  let failures = 0;
  let lastFailureAt: string | null = null;
  let lastError: string | null = null;
  for (const r of history) {
    if (r.health) {
      // An older run with stored health: continue from it.
      return { ...r.health, consecutiveFailures: r.health.consecutiveFailures + failures, lastFailureAt: lastFailureAt ?? r.health.lastFailureAt, lastError: lastError ?? r.health.lastError };
    }
    if (r.ok) return { consecutiveFailures: failures, lastSuccessAt: r.at.toISOString(), lastFailureAt, lastError };
    failures++;
    lastFailureAt ??= r.at.toISOString();
    lastError ??= r.error ?? null;
  }
  return { consecutiveFailures: failures, lastSuccessAt: null, lastFailureAt, lastError };
}

export type HealthLevel = "ok" | "degraded" | "down" | "unknown";

/** ok: last run fine; degraded: 1–2 failures in a row; down: 3 or more. */
export function healthLevel(h: SourceHealth | null | undefined): HealthLevel {
  if (!h) return "unknown";
  if (h.consecutiveFailures === 0) return h.lastSuccessAt ? "ok" : "unknown";
  return h.consecutiveFailures >= 3 ? "down" : "degraded";
}

/** A sync_runs row still "running" after this long without a heartbeat is treated as dead. */
export const STALE_RUN_MS = 30 * 60_000;
/** How often a live run refreshes its heartbeat. */
export const HEARTBEAT_MS = 2 * 60_000;

/** True when a "running" row has had no sign of life (start or heartbeat) for staleMs. */
export function isStaleRun(run: { startedAt: Date; summary?: unknown }, now: Date, staleMs = STALE_RUN_MS): boolean {
  const hb = (run.summary as { heartbeatAt?: unknown } | null | undefined)?.heartbeatAt;
  const beat = typeof hb === "string" ? Date.parse(hb) : Number.NaN;
  const last = Number.isNaN(beat) ? run.startedAt.getTime() : Math.max(beat, run.startedAt.getTime());
  return now.getTime() - last > staleMs;
}
