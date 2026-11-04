import "server-only";
import { and, desc, eq, gt, inArray, ne, not, arrayContains, sql, type SQL } from "drizzle-orm";
import { db, withUser } from "@/lib/db";
import { legalUpdates, syncRuns, updateReceipts } from "@/lib/db/schema";
import { getUpdatesAccess, hasUpdatesAccess } from "@/lib/billing/entitlements";
import type { Notice } from "@/lib/notifications";
import { kindLabel, UPDATE_FILTERS, type UpdateFilter } from "./labels";
import { CORPUS_UPDATED_TAG, INITIAL_IMPORT_TAG } from "./types";

// Reads for the workspace (list, dashboard, bell, pop-up). The feed is shared,
// non-personal data on the owner connection; only receipts are per user (withUser + RLS).

const DAY = 86_400_000;
/** Pop-ups and the bell only show items published (or found, if undated) within this window. */
const FRESH_DAYS = 14;

export type UpdateRow = {
  id: string;
  sourceKey: string;
  sourceName: string;
  kind: string;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: Date | null;
  createdAt: Date;
  importance: string;
  acts: string[];
  tags: string[];
};

const cols = {
  id: legalUpdates.id,
  sourceKey: legalUpdates.sourceKey,
  sourceName: legalUpdates.sourceName,
  kind: legalUpdates.kind,
  title: legalUpdates.title,
  summary: legalUpdates.summary,
  url: legalUpdates.url,
  publishedAt: legalUpdates.publishedAt,
  createdAt: legalUpdates.createdAt,
  importance: legalUpdates.importance,
  acts: legalUpdates.acts,
  tags: legalUpdates.tags,
};

/** The date an item is "about": when it was published, else when Vaakil found it. */
const effectiveAt = sql`coalesce(${legalUpdates.publishedAt}, ${legalUpdates.createdAt})`;

/**
 * Sort key for lists: like effectiveAt, but undated items from a source's first import
 * (its back catalogue, e.g. PRS bills) go last instead of looking like today's news.
 */
const listOrder = sql`case when ${legalUpdates.publishedAt} is null and ${INITIAL_IMPORT_TAG} = any(${legalUpdates.tags}) then null else ${effectiveAt} end desc nulls last`;

/** True for India Code amendments that changed the bare-act text in the corpus. */
export function changedCorpus(u: Pick<UpdateRow, "kind" | "tags">): boolean {
  return u.kind === "amendment" && u.tags.includes(CORPUS_UPDATED_TAG);
}

/** Feed for /app/updates, newest first; hidden items never appear. */
export async function listUpdates({ filter = "all", limit = 120 }: { filter?: UpdateFilter; limit?: number } = {}): Promise<UpdateRow[]> {
  const kinds = UPDATE_FILTERS.find((f) => f.value === filter)?.kinds ?? null;
  const where: SQL[] = [ne(legalUpdates.importance, "hidden")];
  if (kinds) where.push(inArray(legalUpdates.kind, [...kinds]));
  return db
    .select(cols)
    .from(legalUpdates)
    .where(and(...where))
    .orderBy(listOrder, desc(legalUpdates.createdAt))
    .limit(limit);
}

/** Free part of the feed: bare-act amendments applied to the corpus (law text is free). */
export async function corpusAmendments(limit = 20): Promise<UpdateRow[]> {
  return db
    .select(cols)
    .from(legalUpdates)
    .where(and(eq(legalUpdates.kind, "amendment"), arrayContains(legalUpdates.tags, [CORPUS_UPDATED_TAG]), ne(legalUpdates.importance, "hidden")))
    .orderBy(listOrder)
    .limit(limit);
}

/** Titles only, for the locked teaser after the trial ends. */
export async function latestTitles(limit = 3): Promise<{ id: string; title: string; kind: string }[]> {
  return db
    .select({ id: legalUpdates.id, title: legalUpdates.title, kind: legalUpdates.kind })
    .from(legalUpdates)
    .where(ne(legalUpdates.importance, "hidden"))
    .orderBy(listOrder)
    .limit(limit);
}

/** Recent non-hidden items for the dashboard card. */
export async function latestUpdates(limit = 4): Promise<UpdateRow[]> {
  return db
    .select(cols)
    .from(legalUpdates)
    .where(ne(legalUpdates.importance, "hidden"))
    .orderBy(listOrder, desc(legalUpdates.createdAt))
    .limit(Math.max(1, Math.min(limit, 20)));
}

/**
 * High-importance items the user has not seen: found after their last "seen" mark (or in
 * the last 7 days if they never marked one), published recently, and not part of a
 * source's first backfill.
 */
async function unseenHigh(userId: string, limit: number): Promise<UpdateRow[]> {
  const now = Date.now();
  const lastSeen = await withUser(userId, async (tx) => {
    const [r] = await tx.select({ at: updateReceipts.lastSeenAt }).from(updateReceipts).where(eq(updateReceipts.userId, userId)).limit(1);
    return r?.at ?? null;
  });
  const since = lastSeen ?? new Date(now - 7 * DAY);
  return db
    .select(cols)
    .from(legalUpdates)
    .where(
      and(
        eq(legalUpdates.importance, "high"),
        gt(legalUpdates.createdAt, since),
        sql`${effectiveAt} > ${new Date(now - FRESH_DAYS * DAY).toISOString()}::timestamptz`,
        not(arrayContains(legalUpdates.tags, [INITIAL_IMPORT_TAG])),
      ),
    )
    .orderBy(desc(effectiveAt), desc(legalUpdates.createdAt))
    .limit(limit);
}

/** For the pop-up: up to 3 unseen high-importance items, or none without feed access. */
export async function unseenHighUpdates(user: { id: string; role?: string | null }, limit = 3): Promise<UpdateRow[]> {
  const access = await getUpdatesAccess(user);
  if (!hasUpdatesAccess(access)) return [];
  return unseenHigh(user.id, limit);
}

/** Marks everything up to now as seen for this user (pop-up "Read" / "Dismiss"). */
export async function markUpdatesSeen(userId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx
      .insert(updateReceipts)
      .values({ userId, lastSeenAt: sql`now()` })
      .onConflictDoUpdate({ target: updateReceipts.userId, set: { lastSeenAt: sql`now()` } });
  });
}

/** For the notifications bell: unseen high-importance updates from the last 7 days (max 5). */
export async function updateNotices(user: { id: string; role?: string | null }): Promise<Notice[]> {
  const access = await getUpdatesAccess(user);
  if (!hasUpdatesAccess(access)) return [];
  const rows = (await unseenHigh(user.id, 5)).filter((r) => (r.publishedAt ?? r.createdAt).getTime() > Date.now() - 7 * DAY);
  return rows.map((r) => ({
    id: `upd-${r.id}`,
    kind: "update" as const,
    title: r.title,
    detail: `${kindLabel(r.kind)} · ${r.sourceName}`,
    href: "/app/updates",
    at: (r.publishedAt ?? r.createdAt).toISOString(),
    urgent: false,
  }));
}

/** When the feeds were last checked successfully (for the empty state). */
export async function lastSyncAt(): Promise<Date | null> {
  const [r] = await db
    .select({ at: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.kind, "feeds"), inArray(syncRuns.status, ["ok", "partial"])))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);
  return r?.at ?? null;
}
