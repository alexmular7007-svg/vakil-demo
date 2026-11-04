import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, type Db, type Tx } from "@/lib/db";
import { acts, sectionRevisions, sections } from "@/lib/db/schema";
import { REVISION_SOURCES } from "@/lib/db/schema/enums";
import {
  CORPUS_LIMITS,
  planSectionEdits,
  SectionInputError,
  sectionProblem,
  sortKeyForNew,
  UnsafeChangeError,
  type PlannedSection,
} from "./plan";

// The single way to change the statute corpus after seeding. Admin edits and the
// India Code sync both come through here, so every change is recorded (before and
// after) in corpus.section_revisions, which is append-only. Runs on the owner
// connection: callers must authorise first (requireAdmin, or the sync job).
//
// Every write takes a per-act transaction advisory lock, so an admin edit and the
// India Code sync of the same act can never interleave: the second waits for the
// first to commit and then plans against the text the first one left.

export { SectionInputError, UnsafeChangeError } from "./plan";

export type RevisionSource = (typeof REVISION_SOURCES)[number];

export type SectionChange = {
  actId: string;
  sectionNo: string;
  heading: string;
  text: string;
  chapter?: string | null;
  /** Position in the act; derived from neighbours when omitted for a new section. */
  sortKey?: number;
  source: RevisionSource;
  sourceRef?: string | null;
  /** Admin user id, or "system" for the sync job. */
  changedBy: string;
  note?: string | null;
};

export type ChangeResult = "added" | "changed" | "unchanged";

/** One section to add or update in reviseSections. */
export type SectionEdit = {
  sectionNo: string;
  heading: string;
  text: string;
  /** undefined keeps the stored chapter (new sections get none). */
  chapter?: string | null;
  sortKey?: number;
  /** Overrides the batch's sourceRef for this section (e.g. its own India Code record). */
  sourceRef?: string | null;
  /** "new": refuse if the section exists; "existing": refuse if it does not. Checked under the lock. */
  expect?: "new" | "existing";
};

export type RevisionMeta = {
  source: RevisionSource;
  /** Admin user id, or "system" for the sync job. */
  changedBy: string;
  sourceRef?: string | null;
  note?: string | null;
  /** Note on removals, if different from `note`. */
  removalNote?: string | null;
};

export type SectionBatch = { upsert?: SectionEdit[]; remove?: string[] };

export type BatchSummary = {
  actId: string;
  added: string[];
  changed: string[];
  unchanged: string[];
  removed: string[];
  /** Removals asked for sections that do not exist (nothing to do). */
  notFound: string[];
  counts: { added: number; changed: number; unchanged: number; removed: number; notFound: number };
  /** True when anything was written. */
  wrote: boolean;
};

/** Called under the act lock with the plan against the current text; return a reason to refuse. */
export type BatchGuard = (ctx: { added: string[]; changed: string[]; removed: string[]; currentCount: number }) => string | null;

export type BatchOptions = {
  /** Run inside this transaction (the lock is held until it commits). Defaults to a new transaction on the owner connection. */
  conn?: Db | Tx;
  guard?: BatchGuard;
  /** Plan under the lock, write nothing. */
  dryRun?: boolean;
};

type Conn = Db | Tx;

const isTx = (conn: Conn): conn is Tx => typeof (conn as Partial<Tx>).rollback === "function";

/** Runs fn in a transaction: `conn` itself when it already is one, else a new one on it. */
function inTransaction<T>(conn: Conn, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return isTx(conn) ? fn(conn) : (conn as Db).transaction((tx) => fn(tx as unknown as Tx));
}

/** Advisory lock key for an act's text; held until the surrounding transaction ends. */
export function corpusLockKey(actId: string): string {
  return `corpus:${actId}`;
}

async function lockAct(tx: Tx, actId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${corpusLockKey(actId)}))`);
}

function checkActId(actId: unknown): string {
  if (typeof actId !== "string" || !/^[A-Z][A-Z0-9_]{1,15}$/.test(actId)) throw new SectionInputError("Unknown act.", "unknown_act");
  return actId;
}

function checkMeta(meta: RevisionMeta) {
  if (!(REVISION_SOURCES as readonly string[]).includes(meta.source)) throw new SectionInputError("Unknown revision source.", "invalid_meta");
  if (typeof meta.changedBy !== "string" || !meta.changedBy.trim() || meta.changedBy.length > CORPUS_LIMITS.changedByMax) {
    throw new SectionInputError("Who made the change is missing.", "invalid_meta");
  }
  for (const v of [meta.note, meta.removalNote]) {
    if (v != null && (typeof v !== "string" || v.length > CORPUS_LIMITS.noteMax)) throw new SectionInputError(`The note is longer than ${CORPUS_LIMITS.noteMax} characters.`, "invalid_meta");
  }
  if (meta.sourceRef != null && (typeof meta.sourceRef !== "string" || meta.sourceRef.length > CORPUS_LIMITS.sourceRefMax)) {
    throw new SectionInputError("The source reference is too long.", "invalid_meta");
  }
}

/** Validates and normalises a batch before any database work. */
function prepare(actId: string, batch: SectionBatch, meta: RevisionMeta): { upsert: SectionEdit[]; remove: string[] } {
  checkActId(actId);
  checkMeta(meta);
  const upsert = (batch.upsert ?? []).map((e) => ({ ...e, sectionNo: typeof e.sectionNo === "string" ? e.sectionNo.trim().toUpperCase() : e.sectionNo }));
  const remove = (batch.remove ?? []).map((no) => (typeof no === "string" ? no.trim().toUpperCase() : no));
  if (upsert.length + remove.length > CORPUS_LIMITS.batchMax) throw new SectionInputError(`At most ${CORPUS_LIMITS.batchMax} sections can be changed at once.`, "too_many");
  const seen = new Set<string>();
  for (const e of upsert) {
    const problem = sectionProblem(e);
    if (problem) throw new SectionInputError(problem.message, problem.code, String(e.sectionNo));
    if (e.sourceRef != null && (typeof e.sourceRef !== "string" || e.sourceRef.length > CORPUS_LIMITS.sourceRefMax)) {
      throw new SectionInputError(`The source reference of section ${e.sectionNo} is too long.`, "invalid_meta", e.sectionNo);
    }
    if (seen.has(e.sectionNo)) throw new SectionInputError(`Section ${e.sectionNo} appears twice in one change.`, "duplicate", e.sectionNo);
    seen.add(e.sectionNo);
  }
  const removing = new Set<string>();
  for (const no of remove) {
    if (typeof no !== "string" || !/^\d{1,4}[A-Z]{0,4}$/.test(no)) throw new SectionInputError(`"${String(no).slice(0, 20)}" is not a section number.`, "invalid_section_no");
    if (seen.has(no)) throw new SectionInputError(`Section ${no} cannot be both changed and removed.`, "conflict", no);
    if (removing.has(no)) throw new SectionInputError(`Section ${no} appears twice in one change.`, "duplicate", no);
    removing.add(no);
  }
  return { upsert, remove };
}

const CHUNK = 200;

async function applyBatch(tx: Tx, actId: string, batch: { upsert: SectionEdit[]; remove: string[] }, meta: RevisionMeta, opts: BatchOptions): Promise<BatchSummary> {
  await lockAct(tx, actId);
  const [act] = await tx.select({ id: acts.id }).from(acts).where(eq(acts.id, actId)).limit(1);
  if (!act) throw new SectionInputError(`Unknown act ${actId}`, "unknown_act");

  const keys = await tx.select({ sectionNo: sections.sectionNo, sortKey: sections.sortKey }).from(sections).where(eq(sections.actId, actId));
  const affected = [...batch.upsert.map((e) => e.sectionNo), ...batch.remove];
  const current = affected.length
    ? await tx
        .select({ sectionNo: sections.sectionNo, heading: sections.heading, text: sections.text, chapter: sections.chapter })
        .from(sections)
        .where(and(eq(sections.actId, actId), inArray(sections.sectionNo, affected)))
    : [];
  const byNo = new Map(current.map((c) => [c.sectionNo, c]));

  for (const e of batch.upsert) {
    if (e.expect === "new" && byNo.has(e.sectionNo)) throw new SectionInputError(`Section ${e.sectionNo} already exists. Edit it instead.`, "exists", e.sectionNo);
    if (e.expect === "existing" && !byNo.has(e.sectionNo)) throw new SectionInputError(`Section ${e.sectionNo} not found.`, "not_found", e.sectionNo);
  }

  const view = (e: SectionEdit): PlannedSection => ({ sectionNo: e.sectionNo, heading: e.heading, text: e.text, chapter: e.chapter });
  const plan = planSectionEdits(current, batch.upsert.map(view));
  const removed = batch.remove.filter((no) => byNo.has(no));
  const notFound = batch.remove.filter((no) => !byNo.has(no));
  const summary: BatchSummary = {
    actId,
    added: plan.added.map((s) => s.sectionNo),
    changed: plan.changed.map((s) => s.sectionNo),
    unchanged: plan.unchanged,
    removed,
    notFound,
    counts: { added: plan.added.length, changed: plan.changed.length, unchanged: plan.unchanged.length, removed: removed.length, notFound: notFound.length },
    wrote: false,
  };

  const refusal = opts.guard?.({ added: summary.added, changed: summary.changed, removed, currentCount: keys.length });
  if (refusal) throw new UnsafeChangeError(refusal);
  if (opts.dryRun || (!summary.added.length && !summary.changed.length && !removed.length)) return summary;

  const edits = new Map(batch.upsert.map((e) => [e.sectionNo, e]));
  const revisions: (typeof sectionRevisions.$inferInsert)[] = [];
  const ref = (e?: SectionEdit) => (e?.sourceRef !== undefined ? e.sourceRef : (meta.sourceRef ?? null));

  for (const no of summary.changed) {
    const e = edits.get(no)!;
    const cur = byNo.get(no)!;
    const heading = e.heading.trim();
    const text = e.text.trim();
    await tx
      .update(sections)
      .set({ heading, text, ...(e.chapter !== undefined ? { chapter: e.chapter } : {}), ...(e.sortKey !== undefined ? { sortKey: e.sortKey } : {}) })
      .where(and(eq(sections.actId, actId), eq(sections.sectionNo, no)));
    revisions.push({ actId, sectionNo: no, beforeHeading: cur.heading, beforeText: cur.text, afterHeading: heading, afterText: text, source: meta.source, sourceRef: ref(e), changedBy: meta.changedBy, note: meta.note ?? null });
  }

  let order = keys.map((k) => ({ ...k }));
  for (const no of summary.added) {
    const e = edits.get(no)!;
    let sortKey = e.sortKey ?? sortKeyForNew(order, no);
    if (sortKey === null) {
      // No gap left between the neighbours: space the act's keys out (order is kept), then place it.
      await tx.execute(sql`
        update ${sections} s set sort_key = r.rn * 10
        from (select id, row_number() over (order by sort_key, section_no) as rn from ${sections} where act_id = ${actId}) r
        where s.id = r.id`);
      order = await tx.select({ sectionNo: sections.sectionNo, sortKey: sections.sortKey }).from(sections).where(eq(sections.actId, actId));
      sortKey = sortKeyForNew(order, no) ?? Math.max(...order.map((o) => o.sortKey)) + 10;
    }
    const heading = e.heading.trim();
    const text = e.text.trim();
    await tx.insert(sections).values({ actId, sectionNo: no, sortKey, heading, chapter: e.chapter ?? null, text });
    order.push({ sectionNo: no, sortKey });
    revisions.push({ actId, sectionNo: no, beforeHeading: null, beforeText: null, afterHeading: heading, afterText: text, source: meta.source, sourceRef: ref(e), changedBy: meta.changedBy, note: meta.note ?? null });
  }

  if (removed.length) {
    for (let i = 0; i < removed.length; i += CHUNK) {
      await tx.delete(sections).where(and(eq(sections.actId, actId), inArray(sections.sectionNo, removed.slice(i, i + CHUNK))));
    }
    for (const no of removed) {
      const cur = byNo.get(no)!;
      revisions.push({
        actId,
        sectionNo: no,
        beforeHeading: cur.heading,
        beforeText: cur.text,
        afterHeading: null,
        afterText: null,
        source: meta.source,
        sourceRef: meta.sourceRef ?? null,
        changedBy: meta.changedBy,
        note: meta.removalNote ?? meta.note ?? null,
      });
    }
  }

  for (let i = 0; i < revisions.length; i += CHUNK) await tx.insert(sectionRevisions).values(revisions.slice(i, i + CHUNK));
  // Marks the act as changed after seeding, so `npm run db:seed` keeps these edits.
  await tx.update(acts).set({ updatedAt: sql`now()` }).where(eq(acts.id, actId));
  summary.wrote = true;
  return summary;
}

/**
 * Applies many changes to one act in one transaction under the act's lock: adds and
 * updates (`upsert`) and removals (`remove`). Every input is validated before anything
 * is written; a SectionInputError or a guard refusal (UnsafeChangeError) rolls the
 * whole batch back. Unchanged sections are skipped. Returns what happened.
 */
export async function reviseSections(actId: string, changes: SectionBatch | SectionEdit[], meta: RevisionMeta, opts: BatchOptions = {}): Promise<BatchSummary> {
  const batch = prepare(actId, Array.isArray(changes) ? { upsert: changes } : changes, meta);
  return inTransaction(opts.conn ?? db, (tx) => applyBatch(tx, actId, batch, meta, opts));
}

/** Adds or updates one section; a no-op when heading and text (and chapter, if given) are unchanged. */
export async function reviseSection(change: SectionChange, conn: Conn = db): Promise<ChangeResult> {
  const { actId, source, sourceRef, changedBy, note, ...edit } = change;
  const r = await reviseSections(actId, { upsert: [edit] }, { source, sourceRef, changedBy, note }, { conn });
  return r.added.length ? "added" : r.changed.length ? "changed" : "unchanged";
}

/** Removes a section (e.g. omitted by an amendment), keeping its last text in the history. */
export async function removeSection(
  opts: { actId: string; sectionNo: string; source: RevisionSource; sourceRef?: string | null; changedBy: string; note?: string | null },
  conn: Conn = db,
): Promise<boolean> {
  const r = await reviseSections(opts.actId, { remove: [opts.sectionNo] }, { source: opts.source, sourceRef: opts.sourceRef, changedBy: opts.changedBy, note: opts.note }, { conn });
  return r.removed.length > 0;
}

/** Latest revisions across the corpus (admin history, "recently amended" badges). */
export async function recentRevisions(limit = 50, before?: Date) {
  return db
    .select()
    .from(sectionRevisions)
    .where(before ? lt(sectionRevisions.createdAt, before) : undefined)
    .orderBy(sql`${sectionRevisions.createdAt} desc`)
    .limit(limit);
}
