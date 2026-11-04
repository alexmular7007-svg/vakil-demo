import "server-only";
import { and, arrayOverlaps, count, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { acts, legalUpdates, syncRuns } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { classify } from "./classify";
import { fetchText } from "./fetch";
import { healthFromHistory, nextHealth, type SourceHealth, type SourceRunRecord } from "./health";
import { syncIndiaCode, type IndiaCodeResult } from "./india-code";
import { retry } from "./retry";
import { claimLegalUpdatesSync, describeRunning, type RunLease, type RunningSync } from "./runs";
import {
  applyDisabledSources,
  extraFeedSources,
  INDIA_CODE_SOURCE,
  isSourceDisabled,
  parseDisabledSources,
  parseSource,
  SOURCE_DEFAULTS,
  SOURCES,
  type SourceDef,
} from "./sources";
import { titleKey } from "./text";
import { CORPUS_UPDATED_TAG, INITIAL_IMPORT_TAG, type KnownAct, type RawEntry, type UpdateCandidate, type UpdateKind } from "./types";

// The legal-updates job: reads every enabled source once, classifies what it finds,
// stores new items (deduplicated by URL) and records each run in corpus.sync_runs.
// Only one sync runs at a time (see runs.ts): the cron route, the admin "Sync now"
// button, scripts/updates/sync.ts and the local scheduler all go through the same
// claim, and a second caller gets "already running". Each source has its own time
// limit and a few retries for transient errors; one source failing never stops the
// others, and every run records each source's health (failures in a row, last success).

export type SourceResult = {
  ok: boolean;
  fetched: number;
  new: number;
  high: number;
  error?: string;
  ms: number;
  /** Requests made (1 + retries). */
  attempts?: number;
  /** Health after this run. */
  health?: SourceHealth;
};

export type IndiaCodeSummary = Omit<IndiaCodeResult, "amendments" | "newActs"> & {
  newActs: number;
  amendments: number;
  new: number;
  rotation?: string[];
  health?: SourceHealth;
};

export type SyncSummary = {
  feeds?: { runId: string | null; status: string; sources: Record<string, SourceResult> };
  indiaCode?: { runId: string | null; status: string; result: IndiaCodeSummary };
  skipped: string[];
  /** Source keys that are switched off (in sources.ts or DISABLED_UPDATE_SOURCES) and were not read. */
  disabled: string[];
  /** Set when another sync was already running: nothing was done by this call. */
  alreadyRunning?: RunningSync & { message: string };
};

export type SyncOptions = {
  only?: "feeds" | "india_code";
  /** Re-read the section text of every tracked structured act on India Code. */
  deep?: boolean;
  /** Fetch, parse and diff, but write nothing (and take no lock). */
  dryRun?: boolean;
  trigger?: "cron" | "admin" | "local" | "script";
  log?: (msg: string) => void;
};

/** DISABLED_UPDATE_SOURCES as a list of keys. */
export function disabledSourceKeys(): string[] {
  return parseDisabledSources(env.DISABLED_UPDATE_SOURCES);
}

/** Every configured source (built-in plus EXTRA_UPDATE_FEEDS), with DISABLED_UPDATE_SOURCES applied. */
export function activeSources(): SourceDef[] {
  return applyDisabledSources([...SOURCES, ...extraFeedSources(env.EXTRA_UPDATE_FEEDS)], disabledSourceKeys());
}

/** False when India Code is listed in DISABLED_UPDATE_SOURCES. */
export function indiaCodeEnabled(): boolean {
  return !isSourceDisabled(INDIA_CODE_SOURCE.key, disabledSourceKeys());
}

async function knownActs(): Promise<KnownAct[]> {
  return db.select({ id: acts.id, shortTitle: acts.shortTitle, tracked: acts.tracked }).from(acts);
}

const HISTORY_RUNS = 25;

/** Each feed source's history across recent finished runs, newest first. */
export async function feedHistory(keys: string[]): Promise<Map<string, SourceRunRecord[]>> {
  const runs = await db
    .select({ summary: syncRuns.summary, startedAt: syncRuns.startedAt, finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.kind, "feeds"), ne(syncRuns.status, "running")))
    .orderBy(desc(syncRuns.startedAt))
    .limit(HISTORY_RUNS);
  const out = new Map<string, SourceRunRecord[]>(keys.map((k) => [k, []]));
  for (const run of runs) {
    const sources = (run.summary as { sources?: Record<string, SourceResult> } | null)?.sources ?? {};
    for (const [k, r] of Object.entries(sources)) {
      out.get(k)?.push({ ok: Boolean(r.ok), at: run.finishedAt ?? run.startedAt, error: r.error ?? null, health: r.health ?? null });
    }
  }
  return out;
}

/** India Code's history across recent finished runs, newest first ("partial" still reached the source). */
export async function indiaCodeHistory(): Promise<SourceRunRecord[]> {
  const runs = await db
    .select({ status: syncRuns.status, error: syncRuns.error, summary: syncRuns.summary, startedAt: syncRuns.startedAt, finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.kind, "india_code"), ne(syncRuns.status, "running")))
    .orderBy(desc(syncRuns.startedAt))
    .limit(HISTORY_RUNS);
  return runs.map((r) => ({
    ok: r.status !== "failed",
    at: r.finishedAt ?? r.startedAt,
    error: r.error,
    health: ((r.summary as { health?: SourceHealth } | null)?.health ?? null) as SourceHealth | null,
  }));
}

function toCandidate(e: RawEntry, source: { key: string; name: string; kind: UpdateKind }, known: KnownAct[]): UpdateCandidate {
  const c = classify(e, source.kind, known);
  const tags = [...new Set([...c.tags, ...e.categories.filter((x) => x === CORPUS_UPDATED_TAG), `key:${titleKey(e.title)}`])];
  return {
    sourceKey: source.key,
    sourceName: source.name,
    kind: c.kind,
    title: e.title,
    summary: e.summary,
    url: e.url,
    publishedAt: e.publishedAt,
    importance: c.importance,
    acts: [...new Set([...(e.acts ?? []), ...c.acts])].sort(),
    tags,
  };
}

/**
 * Inserts candidates; existing URLs are skipped. The same headline from a second source
 * (a bill on Sansad and on PRS) is stored but not marked "high" again, so one bill
 * produces one pop-up.
 */
async function store(cands: UpdateCandidate[], dryRun: boolean): Promise<{ inserted: number; high: number }> {
  if (!cands.length) return { inserted: 0, high: 0 };
  const keys = cands.filter((c) => c.importance === "high").map((c) => c.tags.find((t) => t.startsWith("key:"))!);
  const seenKeys = new Set<string>();
  if (keys.length) {
    const rows = await db.select({ tags: legalUpdates.tags }).from(legalUpdates).where(arrayOverlaps(legalUpdates.tags, keys));
    for (const r of rows) for (const t of r.tags) if (t.startsWith("key:")) seenKeys.add(t);
  }
  let inserted = 0;
  let high = 0;
  for (const c of cands) {
    const key = c.tags.find((t) => t.startsWith("key:"))!;
    // Every change to a bare act is its own event, even with the same headline as the last one.
    const repeat = seenKeys.has(key) && !c.tags.includes(CORPUS_UPDATED_TAG);
    const importance = c.importance === "high" && !repeat ? "high" : "normal";
    if (dryRun) {
      const [exists] = await db.select({ id: legalUpdates.id }).from(legalUpdates).where(eq(legalUpdates.url, c.url)).limit(1);
      if (!exists) {
        inserted++;
        if (importance === "high") high++;
      }
      continue;
    }
    const rows = await db
      .insert(legalUpdates)
      .values({ ...c, importance })
      .onConflictDoNothing({ target: legalUpdates.url })
      .returning({ id: legalUpdates.id });
    if (rows.length) {
      inserted++;
      if (importance === "high") {
        high++;
        seenKeys.add(key);
      }
    }
  }
  return { inserted, high };
}

const ACCEPT: Record<SourceDef["parser"], string> = {
  "sansad-bills": "application/json",
  rss: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
  "prs-billtrack": "text/html",
};

/** One source's body: its own time limit per request, a few retries for transient errors, a total budget. */
async function fetchSource(s: SourceDef, log: (m: string) => void): Promise<{ body: string | null; error: string | null; attempts: number }> {
  let attempts = 0;
  try {
    const body = await retry(
      ({ remainingMs }) => {
        attempts++;
        return fetchText(s.url, { accept: ACCEPT[s.parser], timeoutMs: Math.max(1000, Math.min(s.timeoutMs ?? SOURCE_DEFAULTS.timeoutMs, remainingMs)) });
      },
      {
        retries: s.retries ?? SOURCE_DEFAULTS.retries,
        baseDelayMs: SOURCE_DEFAULTS.baseDelayMs,
        maxDelayMs: SOURCE_DEFAULTS.maxDelayMs,
        budgetMs: SOURCE_DEFAULTS.budgetMs,
        minAttemptMs: SOURCE_DEFAULTS.minAttemptMs,
        onRetry: ({ attempt, delayMs, error }) => log(`feeds ${s.key}: ${(error as Error).message}; retry ${attempt} in ${Math.round(delayMs / 100) / 10} s`),
      },
    );
    return { body, error: null, attempts };
  } catch (err) {
    return { body: null, error: (err as Error).message ?? String(err), attempts };
  }
}

async function runFeeds(opts: SyncOptions, known: KnownAct[], lease: RunLease | null, summary: SyncSummary): Promise<SyncSummary["feeds"]> {
  const log = opts.log ?? (() => {});
  const all = activeSources();
  const sources = all.filter((s) => s.enabled);
  summary.disabled.push(...all.filter((s) => !s.enabled).map((s) => s.key));
  const now = new Date();
  const history = await feedHistory(sources.map((s) => s.key));
  // One request per source (plus retries), all hosts in parallel; parsing and storing one by one.
  const fetched = await Promise.all(sources.map(async (s) => ({ s, t0: Date.now(), ...(await fetchSource(s, log)) })));
  // A source's first import is a backfill of its recent history: listed, but never a pop-up.
  const seenSources = new Set(
    sources.length
      ? (await db.selectDistinct({ k: legalUpdates.sourceKey }).from(legalUpdates).where(inArray(legalUpdates.sourceKey, sources.map((s) => s.key)))).map((r) => r.k)
      : [],
  );
  const results: Record<string, SourceResult> = {};
  for (const { s, body, t0, error, attempts } of fetched) {
    const prev = healthFromHistory(history.get(s.key) ?? []);
    if (error || body === null) {
      const msg = error ?? "no response";
      results[s.key] = { ok: false, fetched: 0, new: 0, high: 0, error: msg, ms: Date.now() - t0, attempts, health: nextHealth(prev, { ok: false, at: now, error: msg }) };
      log(`feeds ${s.key}: failed after ${attempts} attempt${attempts === 1 ? "" : "s"} (${msg})`);
      continue;
    }
    try {
      const entries = parseSource(s, body, now);
      const cands = entries.map((e) => toCandidate(e, s, known));
      if (!seenSources.has(s.key)) for (const c of cands) c.tags.push(INITIAL_IMPORT_TAG);
      const { inserted, high } = await store(cands, Boolean(opts.dryRun));
      results[s.key] = { ok: true, fetched: entries.length, new: inserted, high, ms: Date.now() - t0, attempts, health: nextHealth(prev, { ok: true, at: now }) };
      log(`feeds ${s.key}: ${entries.length} entries, ${inserted} new (${high} high)${attempts > 1 ? ` after ${attempts} attempts` : ""}`);
    } catch (err) {
      const msg = `parse: ${(err as Error).message}`;
      results[s.key] = { ok: false, fetched: 0, new: 0, high: 0, error: msg, ms: Date.now() - t0, attempts, health: nextHealth(prev, { ok: false, at: now, error: msg }) };
      log(`feeds ${s.key}: parse failed (${(err as Error).message})`);
    }
  }
  const failed = Object.entries(results).filter(([, r]) => !r.ok);
  const status = failed.length === 0 ? "ok" : failed.length === sources.length ? "failed" : "partial";
  const error = failed.length ? failed.map(([k, r]) => `${k}: ${r.error}`).join("; ") : null;
  await lease?.finish("feeds", status, { trigger: opts.trigger ?? "script", sources: results, disabled: [...summary.disabled] }, error);
  return { runId: lease?.ids.feeds ?? null, status, sources: results };
}

async function runIndiaCode(opts: SyncOptions, known: KnownAct[], lease: RunLease | null): Promise<SyncSummary["indiaCode"]> {
  await lease?.begin("india_code");
  const runId = lease?.ids.india_code ?? null;
  const prev = healthFromHistory(await indiaCodeHistory());
  try {
    // One act's section text is re-read per run in rotation, so text edits on India Code
    // that leave the files untouched are still caught within a few days.
    const [{ n }] = await db.select({ n: count() }).from(syncRuns).where(eq(syncRuns.kind, "india_code"));
    const tracked = known.filter((a) => a.tracked).map((a) => a.id).sort();
    const rotation = tracked.length ? [tracked[Number(n) % tracked.length]] : [];
    const result = await syncIndiaCode({ deepActIds: rotation, deepAll: opts.deep, dryRun: opts.dryRun, log: opts.log });
    const src = { key: INDIA_CODE_SOURCE.key, name: INDIA_CODE_SOURCE.name, kind: "act" as UpdateKind };
    const cands = [...result.amendments, ...result.newActs].map((e) => toCandidate(e, src, known));
    // Corpus changes to tracked acts always pop up: the bare act a lawyer relies on changed.
    for (const c of cands) if (c.kind === "amendment" && c.tags.includes(CORPUS_UPDATED_TAG)) c.importance = "high";
    const { inserted } = await store(cands, Boolean(opts.dryRun));
    const errors = result.errors;
    const actErrors = Object.values(result.acts).filter((a) => a.status === "error").length;
    const status = errors.length === 0 ? "ok" : actErrors >= tracked.length && tracked.length > 0 ? "failed" : "partial";
    const summary: IndiaCodeSummary = {
      acts: result.acts,
      requests: result.requests,
      errors,
      newActs: result.newActs.length,
      amendments: result.amendments.length,
      new: inserted,
      newActsError: result.newActsError,
      rotation,
      health: nextHealth(prev, { ok: status !== "failed", at: new Date(), error: errors[0] ?? null }),
    };
    await lease?.finish("india_code", status, { trigger: opts.trigger ?? "script", ...summary }, errors.length ? errors.join("; ") : null);
    return { runId, status, result: summary };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await lease?.finish("india_code", "failed", { trigger: opts.trigger ?? "script", health: nextHealth(prev, { ok: false, at: new Date(), error: msg }) }, msg);
    throw err;
  }
}

/**
 * Runs the legal-updates job. Returns `alreadyRunning` (doing nothing) when another
 * sync holds the lock. Never throws for a single source; throws only if the database
 * is unreachable.
 */
export async function syncLegalUpdates(opts: SyncOptions = {}): Promise<SyncSummary> {
  const log = opts.log ?? (() => {});
  const summary: SyncSummary = { skipped: [], disabled: [] };
  const wantFeeds = opts.only !== "india_code";
  let wantIndia = opts.only !== "feeds";
  if (wantIndia && !indiaCodeEnabled()) {
    wantIndia = false;
    summary.skipped.push("india_code (disabled)");
    summary.disabled.push(INDIA_CODE_SOURCE.key);
    log("india_code: switched off by DISABLED_UPDATE_SOURCES");
  }
  const parts = [...(wantFeeds ? (["feeds"] as const) : []), ...(wantIndia ? (["india_code"] as const) : [])];
  if (!parts.length) return summary;

  const known = await knownActs();
  let lease: RunLease | null = null;
  if (!opts.dryRun) {
    const claim = await claimLegalUpdatesSync(parts, opts.trigger ?? "script");
    if (claim.closedStale) log(`closed ${claim.closedStale} stale run${claim.closedStale === 1 ? "" : "s"}`);
    if (!claim.ok) {
      const message = describeRunning(claim.running);
      summary.alreadyRunning = { ...claim.running, message };
      for (const p of parts) summary.skipped.push(`${p} (already running)`);
      log(message);
      return summary;
    }
    lease = claim.lease;
  }
  try {
    if (wantFeeds) summary.feeds = await runFeeds(opts, known, lease, summary);
    if (wantIndia) {
      try {
        summary.indiaCode = await runIndiaCode(opts, known, lease);
      } catch (err) {
        log(`india_code: failed (${(err as Error).message})`);
        summary.indiaCode = {
          runId: lease?.ids.india_code ?? null,
          status: "failed",
          result: { acts: {}, requests: 0, errors: [(err as Error).message], newActs: 0, amendments: 0, new: 0 },
        };
      }
    }
  } finally {
    // A part that never finished (an unexpected error) must not hold the lock until it goes stale.
    if (lease && !lease.done) await lease.release("Did not finish (stopped by an unexpected error).").catch(() => {});
  }
  return summary;
}
