import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { acts, codeMap, sections } from "@/lib/db/schema";
import { ACT_INFO, actBySlug, isActId, normaliseActId, pairFor, type ActId } from "./acts";
import { isPureReference, parseSectionRefs } from "./refs";
import { NEW_CODES_COMMENCEMENT as COMMENCEMENT, governingCode, parseIndianDate, type GoverningResult } from "./rules";

// Contract used by the AI engine and the research UI. The corpus is public reference
// data (bare acts), so these run on the owner connection; they are server-only and
// never touch user rows.

export type StatuteHit = {
  actId: string; // e.g. "BNS"
  actTitle: string;
  sectionNo: string;
  heading: string;
  /** Short excerpt for lists. */
  snippet: string;
  /** Full section text (for AI context). */
  text: string;
  score: number;
};

export type CodeMapping = {
  oldAct: string;
  oldSection: string;
  newAct: string;
  newSection: string;
  subject: string | null;
  note: string | null;
  source: string;
};

/** Highlight markers used by ts_headline; never present in statute text. */
export const HL_START = "⟪";
export const HL_END = "⟫";
const HL_RE = /[⟪⟫]/g;

export type StatuteHitWithMarks = StatuteHit & { snippetMarked: string; exact: boolean };

const MAX_QUERY = 300;

function cleanSectionNo(no: string) {
  return no.trim().toUpperCase().replace(/^S(EC(TION)?)?\.?\s*/i, "");
}

function excerpt(text: string, n = 260) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1).trimEnd()}…` : flat;
}

/** A built-in act ("crpc", "Cr.P.C.") or the id of an act added in the admin law library ("BNS2"). */
export function resolveActId(input: string): string | null {
  const known = normaliseActId(input);
  if (known) return known;
  const id = input.trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{1,15}$/.test(id) ? id : null;
}

export type ActDisplay = { id: string; slug: string; abbr: string; title: string; known: boolean };

/** Names and URL slug for any act in the corpus, built-in or added by an admin; null if unknown. */
export async function actDisplay(slugOrId: string): Promise<ActDisplay | null> {
  const known = actBySlug(slugOrId) ?? (normaliseActId(slugOrId) ? ACT_INFO[normaliseActId(slugOrId)!] : null);
  if (known) return { id: known.id, slug: known.slug, abbr: known.abbr, title: known.title, known: true };
  const id = resolveActId(slugOrId);
  if (!id) return null;
  const [row] = await db.select({ id: acts.id, title: acts.title }).from(acts).where(eq(acts.id, id)).limit(1);
  return row ? { id: row.id, slug: row.id.toLowerCase(), abbr: row.id, title: row.title, known: false } : null;
}

function resolveActs(list?: string[]): ActId[] | null {
  if (!list?.length) return null;
  const ids = list.map((a) => normaliseActId(a)).filter((a): a is ActId => a !== null);
  return ids.length ? [...new Set(ids)] : null;
}

/**
 * Full-text search with highlight markers, used by the research UI. Direct references
 * ("s. 103 BNS", "BNSS 480", "498A") are resolved first and returned at the top.
 */
export async function searchStatutesMarked(query: string, opts?: { acts?: string[]; limit?: number }): Promise<StatuteHitWithMarks[]> {
  const q = query.trim().slice(0, MAX_QUERY);
  if (!q) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const actFilter = resolveActs(opts?.acts);

  const results: StatuteHitWithMarks[] = [];
  const seen = new Set<string>();

  // 1. Exact references.
  const refs = parseSectionRefs(q);
  for (const ref of refs) {
    const scope = ref.actId ? [ref.actId] : actFilter;
    if (ref.actId && actFilter && !actFilter.includes(ref.actId)) continue;
    const rows = await db
      .select({ actId: sections.actId, actTitle: acts.title, sectionNo: sections.sectionNo, heading: sections.heading, text: sections.text, sortKey: sections.sortKey })
      .from(sections)
      .innerJoin(acts, eq(acts.id, sections.actId))
      .where(and(eq(sections.sectionNo, ref.sectionNo), scope ? inArray(sections.actId, scope) : undefined))
      .orderBy(asc(sections.actId))
      .limit(10);
    for (const r of rows) {
      const key = `${r.actId}:${r.sectionNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const snippet = excerpt(r.text);
      results.push({ actId: r.actId, actTitle: r.actTitle, sectionNo: r.sectionNo, heading: r.heading, text: r.text, snippet, snippetMarked: snippet, score: 1000, exact: true });
    }
  }
  if (refs.length && isPureReference(q)) return results.slice(0, limit);

  // 2. Full-text search (English configuration; headings weigh extra).
  const tsq = sql`websearch_to_tsquery('english', ${q})`;
  const score = sql<number>`(ts_rank(${sections.tsv}, ${tsq}) + case when to_tsvector('english', ${sections.heading}) @@ ${tsq} then 0.5 else 0 end)::float8`;
  const rows = await db
    .select({
      actId: sections.actId,
      actTitle: acts.title,
      sectionNo: sections.sectionNo,
      heading: sections.heading,
      text: sections.text,
      score,
      snippet: sql<string>`ts_headline('english', ${sections.text}, ${tsq}, ${`StartSel=${HL_START}, StopSel=${HL_END}, MaxWords=38, MinWords=18, ShortWord=2, MaxFragments=2, FragmentDelimiter=" … "`})`,
    })
    .from(sections)
    .innerJoin(acts, eq(acts.id, sections.actId))
    .where(and(sql`${sections.tsv} @@ ${tsq}`, actFilter ? inArray(sections.actId, actFilter) : undefined))
    .orderBy(desc(score), asc(sections.actId), asc(sections.sortKey))
    .limit(limit);

  for (const r of rows) {
    const key = `${r.actId}:${r.sectionNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const marked = r.snippet.replace(/\s+/g, " ").trim();
    results.push({
      actId: r.actId,
      actTitle: r.actTitle,
      sectionNo: r.sectionNo,
      heading: r.heading,
      text: r.text,
      snippet: marked.replace(HL_RE, ""),
      snippetMarked: marked,
      score: Number(r.score),
      exact: false,
    });
  }
  return results.slice(0, limit);
}

/** Full-text search across bare acts. */
export async function searchStatutes(query: string, opts?: { acts?: string[]; limit?: number }): Promise<StatuteHit[]> {
  const hits = await searchStatutesMarked(query, opts);
  return hits.map((h) => ({ actId: h.actId, actTitle: h.actTitle, sectionNo: h.sectionNo, heading: h.heading, snippet: h.snippet, text: h.text, score: h.score }));
}

/** Exact section lookup, e.g. getSection("BNS", "103"). Null if not in the corpus. */
export async function getSection(actId: string, sectionNo: string): Promise<StatuteHit | null> {
  const id = resolveActId(actId);
  if (!id) return null;
  const no = cleanSectionNo(sectionNo);
  if (!/^\d{1,3}[A-Z]{0,3}$/.test(no)) return null;
  const [r] = await db
    .select({ actId: sections.actId, actTitle: acts.title, sectionNo: sections.sectionNo, heading: sections.heading, text: sections.text })
    .from(sections)
    .innerJoin(acts, eq(acts.id, sections.actId))
    .where(and(eq(sections.actId, id), eq(sections.sectionNo, no)))
    .limit(1);
  if (!r) return null;
  return { ...r, snippet: excerpt(r.text), score: 1 };
}

/** Section with its neighbours and chapter, for the research section page. */
export async function getSectionDetail(actId: string, sectionNo: string) {
  const id = resolveActId(actId);
  if (!id) return null;
  const no = cleanSectionNo(sectionNo);
  const [row] = await db
    .select({
      actId: sections.actId,
      sectionNo: sections.sectionNo,
      heading: sections.heading,
      chapter: sections.chapter,
      text: sections.text,
      sortKey: sections.sortKey,
    })
    .from(sections)
    .where(and(eq(sections.actId, id), eq(sections.sectionNo, no)))
    .limit(1);
  if (!row) return null;
  const [act] = await db.select().from(acts).where(eq(acts.id, id)).limit(1);
  const [prev] = await db
    .select({ sectionNo: sections.sectionNo, heading: sections.heading })
    .from(sections)
    .where(and(eq(sections.actId, id), sql`${sections.sortKey} < ${row.sortKey}`))
    .orderBy(sql`${sections.sortKey} desc`)
    .limit(1);
  const [next] = await db
    .select({ sectionNo: sections.sectionNo, heading: sections.heading })
    .from(sections)
    .where(and(eq(sections.actId, id), sql`${sections.sortKey} > ${row.sortKey}`))
    .orderBy(asc(sections.sortKey))
    .limit(1);
  return { section: row, act: act ?? null, prev: prev ?? null, next: next ?? null };
}

/** Acts in the database with their section counts (for "Browse acts"). */
export async function listActs() {
  return db
    .select({
      id: acts.id,
      title: acts.title,
      shortTitle: acts.shortTitle,
      year: acts.year,
      inForceFrom: acts.inForceFrom,
      repealedOn: acts.repealedOn,
      replacedBy: acts.replacedBy,
      sourceUrl: acts.sourceUrl,
      // Outer column written out: a bare "id" would bind to sections inside the subquery.
      sectionCount: sql<number>`(select count(*)::int from ${sections} where ${sections.actId} = "acts"."id")`,
    })
    .from(acts)
    .orderBy(asc(acts.year));
}

/** Table of contents of one act from the database. */
export async function listSections(actId: string) {
  const id = resolveActId(actId);
  if (!id) return [];
  return db
    .select({ sectionNo: sections.sectionNo, heading: sections.heading, chapter: sections.chapter })
    .from(sections)
    .where(eq(sections.actId, id))
    .orderBy(asc(sections.sortKey));
}

/**
 * Old↔new criminal code correspondence. With an offence date, also says which
 * code governs (offences before 1 July 2024 stay under the IPC / CrPC / Evidence Act).
 */
export async function convertSection(opts: { fromAct: string; section: string }): Promise<CodeMapping[]> {
  const from = normaliseActId(opts.fromAct);
  if (!from) return [];
  const pair = pairFor(from);
  if (!pair) return [];
  const no = cleanSectionNo(opts.section);
  if (!/^\d{1,3}[A-Z]{0,3}$/.test(no)) return [];
  const isOld = pair.old === from;
  const rows = await db
    .select()
    .from(codeMap)
    .where(isOld ? and(eq(codeMap.oldAct, from), eq(codeMap.oldSection, no)) : and(eq(codeMap.newAct, from), eq(codeMap.newSection, no)))
    .orderBy(isOld ? asc(codeMap.newSection) : asc(codeMap.oldSection));
  return rows.map((r) => ({
    oldAct: r.oldAct,
    oldSection: r.oldSection,
    newAct: r.newAct,
    newSection: r.newSection,
    subject: r.subject,
    note: r.note,
    source: r.source,
  }));
}

export type ConversionResult = {
  fromAct: ActId;
  section: string;
  fromHeading: string | null;
  mappings: (CodeMapping & { otherHeading: string | null })[];
  governing: GoverningResult | null;
};

/** convertSection plus headings and, when a date is given, which code governs and why. */
export async function convertWithDate(opts: { fromAct: string; section: string; date?: string | null }): Promise<ConversionResult | null> {
  const from = normaliseActId(opts.fromAct);
  const pair = from ? pairFor(from) : null;
  if (!from || !pair) return null;
  const no = cleanSectionNo(opts.section);
  const mappings = await convertSection({ fromAct: from, section: no });
  const isOld = pair.old === from;
  const otherNos = [...new Set(mappings.map((m) => (isOld ? m.newSection : m.oldSection)))];
  const otherAct = isOld ? pair.new : pair.old;
  const headingRows = await db
    .select({ actId: sections.actId, sectionNo: sections.sectionNo, heading: sections.heading })
    .from(sections)
    .where(
      sql`(${sections.actId} = ${from} and ${sections.sectionNo} = ${no})${
        otherNos.length ? sql` or (${sections.actId} = ${otherAct} and ${inArray(sections.sectionNo, otherNos)})` : sql``
      }`,
    );
  const heading = (act: string, s: string) => headingRows.find((h) => h.actId === act && h.sectionNo === s)?.heading ?? null;
  const date = opts.date ? parseIndianDate(opts.date) : null;
  return {
    fromAct: from,
    section: no,
    fromHeading: heading(from, no),
    mappings: mappings.map((m) => ({ ...m, otherHeading: isOld ? heading(otherAct, m.newSection) : heading(otherAct, m.oldSection) })),
    governing: date ? governingCode(pair.family, date) : null,
  };
}

export const NEW_CODES_COMMENCEMENT = COMMENCEMENT;

export function governingCriminalCode(offenceDate: string | Date): "IPC" | "BNS" {
  const d = typeof offenceDate === "string" ? new Date(`${offenceDate}T00:00:00+05:30`) : offenceDate;
  return d < new Date(`${NEW_CODES_COMMENCEMENT}T00:00:00+05:30`) ? "IPC" : "BNS";
}

export function actTitle(id: string) {
  return isActId(id) ? ACT_INFO[id].title : id;
}
