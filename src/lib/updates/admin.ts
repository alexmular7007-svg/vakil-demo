import "server-only";
import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalUpdates, syncRuns } from "@/lib/db/schema";
import { healthFromHistory, type SourceHealth } from "./health";
import { activeSources, feedHistory, indiaCodeEnabled, indiaCodeHistory, type SourceResult } from "./sync";
import { INDIA_CODE_SOURCE, type SourceDef } from "./sources";
import { IMPORTANCE, type Importance } from "./types";

// Reads for /admin/updates. Callers must have checked requireAdminPage() first.

export type SourceStatus = {
  key: string;
  name: string;
  homepage: string;
  url: string | null;
  note: string;
  enabled: boolean;
  /** Why it is off: in code (sources.ts) or DISABLED_UPDATE_SOURCES. */
  disabledBy: "code" | "env" | null;
  parser: SourceDef["parser"] | "india-code";
  total: number;
  last: (SourceResult & { at: Date }) | null;
  /** Failures in a row and last success, across recent runs. */
  health: SourceHealth | null;
};

export async function sourceStatuses(): Promise<SourceStatus[]> {
  const sources = activeSources();
  const [totals, lastFeeds, lastIndia, feedHist, indiaHist] = await Promise.all([
    db.select({ key: legalUpdates.sourceKey, n: count() }).from(legalUpdates).groupBy(legalUpdates.sourceKey),
    db.select().from(syncRuns).where(and(eq(syncRuns.kind, "feeds"), ne(syncRuns.status, "running"))).orderBy(desc(syncRuns.startedAt)).limit(10),
    db.select().from(syncRuns).where(and(eq(syncRuns.kind, "india_code"), ne(syncRuns.status, "running"))).orderBy(desc(syncRuns.startedAt)).limit(1),
    feedHistory(sources.map((s) => s.key)),
    indiaCodeHistory(),
  ]);
  const icOn = indiaCodeEnabled();
  const totalBy = new Map(totals.map((t) => [t.key, Number(t.n)]));
  // The latest finished run that included each source.
  const lastBy = new Map<string, SourceResult & { at: Date }>();
  for (const run of lastFeeds) {
    const res = (run.summary as { sources?: Record<string, SourceResult> } | null)?.sources ?? {};
    for (const [k, r] of Object.entries(res)) if (!lastBy.has(k)) lastBy.set(k, { ...r, at: run.finishedAt ?? run.startedAt });
  }
  const out: SourceStatus[] = [];
  const ic = lastIndia[0];
  const icSummary = (ic?.summary ?? {}) as { new?: number; errors?: string[]; newActs?: number; amendments?: number };
  out.push({
    key: INDIA_CODE_SOURCE.key,
    name: INDIA_CODE_SOURCE.name,
    homepage: INDIA_CODE_SOURCE.homepage,
    url: null,
    note: INDIA_CODE_SOURCE.note,
    enabled: icOn,
    disabledBy: icOn ? null : "env",
    parser: "india-code",
    total: totalBy.get(INDIA_CODE_SOURCE.key) ?? 0,
    last: ic
      ? {
          ok: ic.status === "ok",
          fetched: (icSummary.newActs ?? 0) + (icSummary.amendments ?? 0),
          new: icSummary.new ?? 0,
          high: 0,
          error: ic.error ?? undefined,
          ms: ic.finishedAt ? ic.finishedAt.getTime() - ic.startedAt.getTime() : 0,
          at: ic.finishedAt ?? ic.startedAt,
        }
      : null,
    health: healthFromHistory(indiaHist),
  });
  for (const s of sources) {
    out.push({
      key: s.key,
      name: s.name,
      homepage: s.homepage,
      url: s.url,
      note: s.note,
      enabled: s.enabled,
      disabledBy: s.enabled ? null : (s.disabledBy ?? "code"),
      parser: s.parser,
      total: totalBy.get(s.key) ?? 0,
      last: lastBy.get(s.key) ?? null,
      health: healthFromHistory(feedHist.get(s.key) ?? []),
    });
  }
  return out;
}

/** Legal-updates runs still marked running (the sync in progress, if any). */
export async function runningRuns() {
  return db
    .select()
    .from(syncRuns)
    .where(and(inArray(syncRuns.kind, ["feeds", "india_code"]), eq(syncRuns.status, "running")))
    .orderBy(desc(syncRuns.startedAt));
}

export async function recentRuns(limit = 15) {
  return db.select().from(syncRuns).where(inArray(syncRuns.kind, ["feeds", "india_code"])).orderBy(desc(syncRuns.startedAt)).limit(limit);
}

export function parseImportanceFilter(v: string | string[] | undefined): Importance | "all" {
  const s = Array.isArray(v) ? v[0] : v;
  return (IMPORTANCE as readonly string[]).includes(s ?? "") ? (s as Importance) : "all";
}

export async function adminItems(importance: Importance | "all", limit = 100) {
  return db
    .select()
    .from(legalUpdates)
    .where(importance === "all" ? undefined : eq(legalUpdates.importance, importance))
    .orderBy(desc(legalUpdates.createdAt))
    .limit(limit);
}

export async function importanceCounts(): Promise<Record<string, number>> {
  const rows = await db.select({ importance: legalUpdates.importance, n: count() }).from(legalUpdates).groupBy(legalUpdates.importance);
  const out: Record<string, number> = { all: 0 };
  for (const r of rows) {
    out[r.importance] = Number(r.n);
    out.all += Number(r.n);
  }
  return out;
}

/** Items stored in the last 24 hours that are not hidden (overview line). */
export async function newToday(): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(legalUpdates)
    .where(sql`${legalUpdates.createdAt} > now() - interval '1 day' and ${ne(legalUpdates.importance, "hidden")}`);
  return Number(r?.n ?? 0);
}
