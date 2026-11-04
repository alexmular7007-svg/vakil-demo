import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { acts, sections } from "@/lib/db/schema";
import { reviseSections, UnsafeChangeError } from "@/lib/corpus/revise";
import { ACTS } from "../../../scripts/corpus/acts.mjs";
import { handleUrl } from "../../../scripts/corpus/lib/indiacode-text.mjs";
import { fetchBytes, fetchJson } from "./fetch";
import { retry } from "./retry";
import {
  actFingerprint,
  bitstreamsFrom,
  chapterForNew,
  diffSections,
  formatVersion,
  handleFromUrl,
  md,
  newActEntries,
  parseVersion,
  sectionList,
  sectionsFromItems,
  sectionsFromPdfParse,
  sectionsHash,
  unsafeDiffReason,
  type Bitstream,
  type CurrentSection,
  type DSpaceItem,
  type ParsedSection,
} from "./india-code-parse";
import { clip } from "./text";
import { CORPUS_UPDATED_TAG, type RawEntry } from "./types";

// India Code sync. For each tracked act: one search (the ACT record) and one bundle
// listing (file checksums) give a cheap fingerprint. When it differs from the stored
// acts.source_version, or for the act whose turn it is in the rotation, the section
// text is re-read with the corpus pipeline and only changed / added / removed sections
// are written, in one transaction through reviseSections (recorded in section_revisions,
// under the act's advisory lock, with the safety rule re-checked against the text as it
// is at that moment, so a concurrent admin edit is never overwritten blindly).

const API = "https://indiacode.gov.in/server/api";
const PAUSE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ActConfig = { id: string; kind: "structured" | "pdf"; indiaCodeActId?: string; itemUuid?: string; pdfName?: string };
const CONFIG = new Map<string, ActConfig>((ACTS as ActConfig[]).map((a) => [a.id, a]));

export type ActOutcome = {
  status: "unchanged" | "baseline" | "updated" | "skipped" | "error";
  changed?: number;
  added?: number;
  removed?: number;
  note?: string;
};

export type IndiaCodeResult = {
  acts: Record<string, ActOutcome>;
  amendments: RawEntry[];
  newActs: RawEntry[];
  newActsError?: string;
  requests: number;
  errors: string[];
};

type Counter = { n: number };

/** India Code requests: 45 s each, two retries with backoff for transient errors only. */
const API_RETRY = { retries: 2, baseDelayMs: 1500, maxDelayMs: 10_000 } as const;

async function api<T>(path: string, counter: Counter): Promise<T> {
  counter.n++;
  if (counter.n > 1) await sleep(PAUSE_MS);
  return retry(() => fetchJson<T>(`${API}${path}`, { timeoutMs: 45_000, maxBytes: 25_000_000 }), API_RETRY);
}

type SearchJson = { _embedded: { searchResult: { page: { totalPages: number }; _embedded: { objects: { _embedded: { indexableObject: DSpaceItem } }[] } } } };

async function search(query: string, counter: Counter, opts: { size?: number; page?: number; sort?: string } = {}) {
  const q = new URLSearchParams({ query, dsoType: "ITEM", size: String(opts.size ?? 10), page: String(opts.page ?? 0) });
  if (opts.sort) q.set("sort", opts.sort);
  const d = await api<SearchJson>(`/discover/search/objects?${q}`, counter);
  const sr = d._embedded.searchResult;
  return { items: sr._embedded.objects.map((o) => o._embedded.indexableObject), totalPages: sr.page.totalPages };
}

/** The ACT record of a corpus act: from the ingest config, else from its India Code handle URL. */
async function actRecord(act: { id: string; sourceUrl: string }, counter: Counter): Promise<{ item: DSpaceItem; kind: "structured" | "pdf"; actId: string | null }> {
  const cfg = CONFIG.get(act.id);
  if (cfg?.kind === "structured" && cfg.indiaCodeActId) {
    const { items } = await search(`dc.identifier.act_id:"${cfg.indiaCodeActId}" AND dc.identifier.collection:ACT`, counter, { size: 2 });
    if (!items[0]) throw new Error("ACT record not found on India Code");
    return { item: items[0], kind: "structured", actId: cfg.indiaCodeActId };
  }
  if (cfg?.kind === "pdf" && cfg.itemUuid) {
    const item = await api<DSpaceItem>(`/core/items/${cfg.itemUuid}`, counter);
    return { item, kind: "pdf", actId: null };
  }
  const handle = handleFromUrl(act.sourceUrl);
  if (!handle) throw new Error("source URL is not an India Code record");
  const { items } = await search(`handle:"${handle}"`, counter, { size: 1 });
  if (!items[0]) throw new Error(`India Code record ${handle} not found`);
  const actId = md(items[0], "dc.identifier.act_id");
  return { item: items[0], kind: actId && md(items[0], "dc.identifier.collection") === "ACT" ? "structured" : "pdf", actId };
}

async function bitstreams(uuid: string, counter: Counter): Promise<Bitstream[]> {
  return bitstreamsFrom(await api(`/core/items/${uuid}/bundles?embed=bitstreams`, counter));
}

/** Same choice as ingest.mjs: the English text, not the Hindi ("H…") edition. */
function pickPdf(streams: Bitstream[], preferName?: string) {
  const pdfs = streams.filter((b) => b.bundle === "ORIGINAL" && /\.pdf$/i.test(b.name));
  return (preferName && pdfs.find((b) => b.name === preferName)) || pdfs.filter((b) => !/^H/i.test(b.name)).sort((a, b) => a.size - b.size)[0] || pdfs[0] || null;
}

async function readStructured(actId: string, counter: Counter): Promise<ParsedSection[]> {
  const items: DSpaceItem[] = [];
  for (let page = 0; page < 20; page++) {
    const r = await search(`dc.identifier.act_id:"${actId}"`, counter, { size: 100, page });
    items.push(...r.items);
    if (page + 1 >= r.totalPages) break;
  }
  return sectionsFromItems(items);
}

async function readPdf(streams: Bitstream[], pdfName: string | undefined, sourceUrl: string, counter: Counter): Promise<{ sections: ParsedSection[]; missing: string[] }> {
  const pdf = pickPdf(streams, pdfName);
  if (!pdf) throw new Error("no PDF on the India Code record");
  counter.n++;
  const buf = await retry(() => fetchBytes(pdf.url), { ...API_RETRY, retries: 1 });
  // Loaded only when a PDF act changed: the PDF pipeline is heavy.
  const { pdfToPages } = await import("../../../scripts/corpus/lib/pdf-lines.mjs");
  const { flatten, parseToc, parseBody } = await import("../../../scripts/corpus/lib/parse-act-pdf.mjs");
  const { pages } = await pdfToPages(buf);
  const lines = flatten(pages);
  const toc = parseToc(lines);
  const { sections: parsed, missing } = parseBody(lines, toc);
  return { sections: sectionsFromPdfParse(parsed, sourceUrl), missing: missing as string[] };
}

async function currentSections(actId: string): Promise<CurrentSection[]> {
  return db
    .select({ sectionNo: sections.sectionNo, heading: sections.heading, text: sections.text, chapter: sections.chapter, sortKey: sections.sortKey })
    .from(sections)
    .where(eq(sections.actId, actId));
}

/**
 * Applies a diff in one transaction through reviseSections (the revision-recording
 * API), with the stored source version. Under the act lock the safety rule is checked
 * again against the corpus as it is then; a refusal rolls everything back.
 */
async function applyDiff(actId: string, actUrl: string, next: ParsedSection[], current: CurrentSection[], diff: ReturnType<typeof diffSections>, version: string) {
  const note = "India Code sync";
  return db.transaction(async (t) => {
    const tx = t as unknown as Tx;
    const summary = await reviseSections(
      actId,
      {
        upsert: [
          ...diff.changed.map((s) => ({ sectionNo: s.no, heading: s.heading, text: s.text, sourceRef: s.sourceUrl ?? actUrl })),
          ...diff.added.map((s) => ({ sectionNo: s.no, heading: s.heading, text: s.text, chapter: chapterForNew(next, current, s.no), sourceRef: s.sourceUrl ?? actUrl })),
        ],
        remove: diff.removed,
      },
      { source: "india_code", changedBy: "system", sourceRef: actUrl, note, removalNote: `${note}: no longer on India Code` },
      { conn: tx, guard: ({ removed, currentCount }) => unsafeDiffReason({ removed }, currentCount, next.length) },
    );
    await tx.update(acts).set({ sourceVersion: version, lastSyncedAt: sql`now()` }).where(eq(acts.id, actId));
    return summary;
  });
}

function amendmentEntry(act: { id: string; title: string }, actUrl: string, diff: ReturnType<typeof diffSections>, hash: string): RawEntry {
  const parts = [
    diff.changed.length ? `${diff.changed.length} section${diff.changed.length === 1 ? "" : "s"} changed` : "",
    diff.added.length ? `${diff.added.length} added` : "",
    diff.removed.length ? `${diff.removed.length} removed` : "",
  ].filter(Boolean);
  const nos = [...diff.changed.map((s) => s.no), ...diff.added.map((s) => s.no), ...diff.removed];
  return {
    title: `${act.title}: bare act updated on India Code`,
    // The act page is the same for every update, so each update gets its own fragment.
    url: `${actUrl}#update-${hash.slice(0, 10)}`,
    summary: clip(`${parts.join(", ")} (s. ${sectionList(nos)}). Vaakil's bare act now matches India Code.`, 200),
    publishedAt: new Date(),
    categories: ["India Code", CORPUS_UPDATED_TAG],
    kind: "amendment",
    acts: [act.id],
  };
}

export type IndiaCodeOptions = {
  /** Act ids whose section text is re-read even if the fingerprint is unchanged. */
  deepActIds?: string[];
  /** Re-read every structured act's sections. */
  deepAll?: boolean;
  /** Compute and log, but write nothing. */
  dryRun?: boolean;
  log?: (msg: string) => void;
};

export async function syncIndiaCode(opts: IndiaCodeOptions = {}): Promise<IndiaCodeResult> {
  const log = opts.log ?? (() => {});
  const counter: Counter = { n: 0 };
  const result: IndiaCodeResult = { acts: {}, amendments: [], newActs: [], requests: 0, errors: [] };
  const rows = await db
    .select({ id: acts.id, title: acts.title, sourceUrl: acts.sourceUrl, sourceVersion: acts.sourceVersion, tracked: acts.tracked })
    .from(acts)
    .orderBy(acts.id);

  for (const act of rows) {
    if (!act.tracked) {
      result.acts[act.id] = { status: "skipped", note: "not tracked" };
      continue;
    }
    try {
      const { item, kind, actId } = await actRecord(act, counter);
      const streams = await bitstreams(item.uuid, counter);
      const fp = actFingerprint(item, streams);
      const stored = parseVersion(act.sourceVersion);
      const actUrl = handleUrl(item.handle) as string;
      const baseline = !stored.fp;
      const fpChanged = !baseline && stored.fp !== fp;
      const wantDeep = kind === "structured" ? baseline || fpChanged || opts.deepAll || opts.deepActIds?.includes(act.id) : fpChanged;

      if (!wantDeep) {
        // PDF acts are only re-read when their files change; the first run records a baseline.
        if (!opts.dryRun) await db.update(acts).set({ sourceVersion: formatVersion(fp, stored.sections), lastSyncedAt: sql`now()` }).where(eq(acts.id, act.id));
        result.acts[act.id] = { status: baseline ? "baseline" : "unchanged" };
        log(`india_code ${act.id}: ${baseline ? "baseline recorded" : "unchanged"}`);
        continue;
      }

      let next: ParsedSection[];
      let missing: string[] = [];
      if (kind === "structured" && actId) {
        next = await readStructured(actId, counter);
      } else {
        const r = await readPdf(streams, CONFIG.get(act.id)?.pdfName, actUrl, counter);
        next = r.sections;
        missing = r.missing;
      }
      if (!next.length) throw new Error("no sections could be read from India Code");
      const hash = sectionsHash(next);
      const version = formatVersion(fp, hash);
      if (stored.sections === hash) {
        if (!opts.dryRun) await db.update(acts).set({ sourceVersion: version, lastSyncedAt: sql`now()` }).where(eq(acts.id, act.id));
        result.acts[act.id] = { status: "unchanged", note: "section text checked" };
        log(`india_code ${act.id}: section text unchanged`);
        continue;
      }

      const current = await currentSections(act.id);
      // A section the PDF parser could not find is unknown, not removed.
      const diff = diffSections(current, next, { keep: missing });
      const total = diff.changed.length + diff.added.length + diff.removed.length;
      if (total === 0) {
        if (!opts.dryRun) await db.update(acts).set({ sourceVersion: version, lastSyncedAt: sql`now()` }).where(eq(acts.id, act.id));
        result.acts[act.id] = { status: baseline ? "baseline" : "unchanged", note: "section text matches the corpus" };
        log(`india_code ${act.id}: section text matches the corpus`);
        continue;
      }
      const unsafe = unsafeDiffReason(diff, current.length, next.length);
      if (unsafe) {
        if (!opts.dryRun) await db.update(acts).set({ lastSyncedAt: sql`now()` }).where(eq(acts.id, act.id));
        result.acts[act.id] = { status: "error", note: unsafe };
        result.errors.push(`${act.id}: ${unsafe}`);
        log(`india_code ${act.id}: ${unsafe}`);
        continue;
      }
      log(
        `india_code ${act.id}: ${diff.changed.length} changed [${sectionList(diff.changed.map((s) => s.no), 12)}], ${diff.added.length} added [${sectionList(diff.added.map((s) => s.no), 12)}], ${diff.removed.length} removed [${sectionList(diff.removed, 12)}]${opts.dryRun ? " (dry run, not applied)" : ""}`,
      );
      if (!opts.dryRun) {
        try {
          const applied = await applyDiff(act.id, actUrl, next, current, diff, version);
          // Report what was actually written: an admin edit in between can make a change unnecessary.
          const byNo = new Map(next.map((s) => [s.no, s]));
          diff.changed = applied.changed.flatMap((no) => byNo.get(no) ?? []);
          diff.added = applied.added.flatMap((no) => byNo.get(no) ?? []);
          diff.removed = applied.removed;
        } catch (err) {
          if (!(err instanceof UnsafeChangeError)) throw err;
          await db.update(acts).set({ lastSyncedAt: sql`now()` }).where(eq(acts.id, act.id));
          result.acts[act.id] = { status: "error", note: err.message };
          result.errors.push(`${act.id}: ${err.message}`);
          log(`india_code ${act.id}: ${err.message}`);
          continue;
        }
      }
      if (!diff.changed.length && !diff.added.length && !diff.removed.length) {
        result.acts[act.id] = { status: "unchanged", note: "already applied" };
        continue;
      }
      result.acts[act.id] = { status: "updated", changed: diff.changed.length, added: diff.added.length, removed: diff.removed.length };
      result.amendments.push(amendmentEntry(act, actUrl, diff, hash));
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      result.acts[act.id] = { status: "error", note: msg };
      result.errors.push(`${act.id}: ${msg}`);
      log(`india_code ${act.id}: error ${msg}`);
    }
  }

  // New central Acts of this year (and last year in January–February, while India Code catches up).
  try {
    const now = new Date();
    const year = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(now));
    const month = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "numeric" }).format(now));
    const years = month <= 2 ? `(dc.date.act_year:${year} OR dc.date.act_year:${year - 1})` : `dc.date.act_year:${year}`;
    const { items } = await search(`dc.identifier.collection:ACT AND dc.identifier.state_name:CENTRAL AND ${years}`, counter, { size: 50, sort: "dc.date.issued,DESC" });
    const corpusHandles = new Set(rows.map((r) => handleFromUrl(r.sourceUrl)).filter((h): h is string => Boolean(h)));
    result.newActs = newActEntries({ _embedded: { searchResult: { _embedded: { objects: items.map((i) => ({ _embedded: { indexableObject: i } })) } } } }, corpusHandles);
    log(`india_code new acts: ${result.newActs.length} central Acts listed for ${years}`);
  } catch (err) {
    result.newActsError = (err as Error).message;
    result.errors.push(`new acts: ${(err as Error).message}`);
  }

  result.requests = counter.n;
  return result;
}

/** Tracked acts as admins see them. */
export async function trackedActs() {
  return db
    .select({ id: acts.id, title: acts.title, tracked: acts.tracked, sourceUrl: acts.sourceUrl, sourceVersion: acts.sourceVersion, lastSyncedAt: acts.lastSyncedAt, updatedAt: acts.updatedAt })
    .from(acts)
    .where(and(eq(acts.tracked, true)))
    .orderBy(acts.id);
}
