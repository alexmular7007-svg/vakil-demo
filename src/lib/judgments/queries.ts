import "server-only";
import { and, asc, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { judgmentParas, judgments } from "@/lib/db/schema";
import { HL_END, HL_START } from "@/lib/corpus/search";
import {
  anchorWord,
  citationKey,
  citationKeys,
  findCaseNames,
  findCitations,
  orTsQuery,
  significantTerms,
  titleMatchesCaseName,
  type CaseName,
  type ParaCandidate,
} from "./cite";

// The judgments library is public reference data (court judgments), so it is read
// on the owner connection like the statute corpus. Server-only; never touches
// user rows.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isJudgmentId = (id: string) => UUID_RE.test(id);

const MAX_QUERY = 300;
const HEADLINE_OPTS = `StartSel=${HL_START}, StopSel=${HL_END}, MaxWords=40, MinWords=18, ShortWord=2, MaxFragments=2, FragmentDelimiter=" … "`;

export type JudgmentMeta = {
  id: string;
  court: string;
  title: string;
  decidedOn: string | null;
  citation: string | null;
  caseNo: string | null;
  bench: string | null;
};

const metaCols = {
  id: judgments.id,
  court: judgments.court,
  title: judgments.title,
  decidedOn: judgments.decidedOn,
  citation: judgments.citation,
  caseNo: judgments.caseNo,
  bench: judgments.bench,
};

function likeEscape(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function filters(opts: { court?: string | null; year?: number | null }): SQL[] {
  const out: SQL[] = [];
  if (opts.court) out.push(eq(judgments.court, opts.court));
  if (opts.year && opts.year >= 1900 && opts.year <= 2100) {
    out.push(gte(judgments.decidedOn, `${opts.year}-01-01`), lt(judgments.decidedOn, `${opts.year + 1}-01-01`));
  }
  return out;
}

/* ------------------------------- lookups ------------------------------- */

/** Library judgments whose stored citation equals any of these (normalised). */
async function byCitations(citations: string[]): Promise<(JudgmentMeta & { matched: string })[]> {
  const keys = [...new Set(citations.map(citationKey).filter((k) => k.length >= 6))].slice(0, 10);
  if (!keys.length) return [];
  const norm = sql`(';' || replace(regexp_replace(upper(${judgments.citation}), '[^A-Z0-9;,]', '', 'g'), ',', ';') || ';')`;
  const rows = await db
    .select(metaCols)
    .from(judgments)
    .where(or(...keys.map((k) => sql`${norm} like ${`%;${k};%`}`)))
    .limit(20);
  const out: (JudgmentMeta & { matched: string })[] = [];
  for (const r of rows) {
    const have = citationKeys(r.citation);
    const hit = citations.find((c) => have.includes(citationKey(c)));
    if (hit) out.push({ ...r, matched: hit });
  }
  return out;
}

/** Library judgments whose title (or parties line) is the named case. */
async function byCaseNames(names: CaseName[]): Promise<(JudgmentMeta & { matched: string })[]> {
  const out: (JudgmentMeta & { matched: string })[] = [];
  for (const n of names.slice(0, 6)) {
    const a = `%${likeEscape(anchorWord(n.first))}%`;
    const b = `%${likeEscape(anchorWord(n.second))}%`;
    const rows = await db
      .select({ ...metaCols, parties: judgments.parties })
      .from(judgments)
      .where(and(or(ilike(judgments.title, a), ilike(judgments.parties, a)), or(ilike(judgments.title, b), ilike(judgments.parties, b))))
      .limit(15);
    for (const r of rows) {
      if (titleMatchesCaseName(r.title, n) || (r.parties && titleMatchesCaseName(r.parties, n))) {
        const { parties: _p, ...meta } = r;
        void _p;
        out.push({ ...meta, matched: n.text });
      }
    }
  }
  return out;
}

/**
 * Case references (citations and "A v. B" names) looked up in the library. The
 * map is keyed by the reference text as written; unmatched references are absent.
 */
export async function findJudgmentsForRefs(refs: { citations: string[]; names: CaseName[] }): Promise<Map<string, JudgmentMeta>> {
  const found = new Map<string, JudgmentMeta>();
  const [a, b] = await Promise.all([byCitations(refs.citations), byCaseNames(refs.names)]);
  for (const r of [...a, ...b]) {
    const { matched, ...meta } = r;
    if (!found.has(matched)) found.set(matched, meta);
  }
  return found;
}

/* ------------------------------- retrieval ------------------------------- */

export type JudgmentCandidate = ParaCandidate & { judgment: JudgmentMeta };

/**
 * Paragraph candidates for an AI answer: paragraphs of cases the question names
 * (by citation or "A v. B"), then the best full-text matches across the library.
 * Ranking and filtering happen in pickParagraphs.
 */
export async function judgmentCandidates(question: string, opts?: { max?: number }): Promise<{ candidates: JudgmentCandidate[]; terms: string[] }> {
  const q = question.slice(0, 1000);
  const terms = significantTerms(q);
  const orq = orTsQuery(terms);
  const tsOr = orq ? sql`to_tsquery('english', ${orq})` : null;
  const tsAll = sql`websearch_to_tsquery('english', ${q.slice(0, 500)})`;
  const candidates: JudgmentCandidate[] = [];

  // 1. Cases named in the question.
  const named = await findJudgmentsForRefs({ citations: findCitations(q), names: findCaseNames(q) });
  const namedIds = [...new Set([...named.values()].map((j) => j.id))].slice(0, 3);
  for (const id of namedIds) {
    const meta = [...named.values()].find((j) => j.id === id)!;
    const score = tsOr
      ? sql<number>`(ts_rank(${judgmentParas.tsv}, ${tsOr}, 1) * case when ${judgmentParas.paraNo} = 0 then 0.6 else 1 end)::float8`
      : sql<number>`0::float8`;
    const paras = await db
      .select({ paraNo: judgmentParas.paraNo, text: judgmentParas.text, score })
      .from(judgmentParas)
      .where(eq(judgmentParas.judgmentId, id))
      .orderBy(desc(score), asc(judgmentParas.paraNo))
      .limit(2);
    for (const p of paras) candidates.push({ judgmentId: id, paraNo: p.paraNo, text: p.text, score: Number(p.score), exact: true, judgment: meta });
  }

  // 2. Ranked full-text matches (any term; all terms together rank higher).
  if (tsOr) {
    // All terms together rank higher; the cause title / headnote (para 0) ranks lower than the judgment's own paragraphs.
    const score = sql<number>`((ts_rank(${judgmentParas.tsv}, ${tsOr}, 1) + case when ${judgmentParas.tsv} @@ ${tsAll} then 1 else 0 end) * case when ${judgmentParas.paraNo} = 0 then 0.6 else 1 end)::float8`;
    const rows = await db
      .select({ ...metaCols, paraNo: judgmentParas.paraNo, text: judgmentParas.text, score })
      .from(judgmentParas)
      .innerJoin(judgments, eq(judgments.id, judgmentParas.judgmentId))
      .where(sql`${judgmentParas.tsv} @@ ${tsOr}`)
      .orderBy(desc(score))
      .limit(opts?.max ?? 40);
    for (const r of rows) {
      const { paraNo, text, score: s, ...meta } = r;
      candidates.push({ judgmentId: meta.id, paraNo, text, score: Number(s), judgment: meta });
    }
  }
  return { candidates, terms };
}

/* ------------------------------- research ------------------------------- */

export type CaseLawHit = JudgmentMeta & {
  paraNo: number | null;
  snippetMarked: string;
  /** Paragraphs in this judgment that matched. */
  hits: number;
  exact: boolean;
};

function excerpt(text: string, n = 260) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1).trimEnd()}…` : flat;
}

/**
 * Research "Case law" search: cases named by citation or title come first, then
 * judgments ranked by their best-matching paragraph, with a highlighted snippet.
 */
export async function searchCaseLaw(query: string, opts?: { court?: string | null; year?: number | null; limit?: number }): Promise<CaseLawHit[]> {
  const q = query.trim().slice(0, MAX_QUERY);
  if (!q) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const where = filters(opts ?? {});
  const results: CaseLawHit[] = [];
  const seen = new Set<string>();

  // 1. Citation, case name, case number or title words.
  const named = await findJudgmentsForRefs({ citations: findCitations(q), names: findCaseNames(q) });
  const like = `%${likeEscape(q)}%`;
  const titleRows =
    q.length >= 3
      ? await db
          .select(metaCols)
          .from(judgments)
          .where(and(or(ilike(judgments.title, like), ilike(judgments.caseNo, like), ilike(judgments.citation, like), ilike(judgments.parties, like)), ...where))
          .orderBy(desc(judgments.decidedOn))
          .limit(10)
      : [];
  const exactIds = [...named.values(), ...titleRows];
  for (const j of exactIds) {
    if (seen.has(j.id)) continue;
    if (opts?.court && j.court !== opts.court) continue;
    if (opts?.year && !j.decidedOn?.startsWith(String(opts.year))) continue;
    seen.add(j.id);
    const [first] = await db
      .select({ text: judgmentParas.text, paraNo: judgmentParas.paraNo })
      .from(judgmentParas)
      .where(and(eq(judgmentParas.judgmentId, j.id), sql`${judgmentParas.paraNo} > 0`))
      .orderBy(asc(judgmentParas.paraNo))
      .limit(1);
    results.push({ ...j, paraNo: first?.paraNo ?? null, snippetMarked: first ? excerpt(first.text) : "", hits: 0, exact: true });
  }

  // 2. Full text, best paragraph per judgment.
  const tsq = sql`websearch_to_tsquery('english', ${q})`;
  const rank = sql`ts_rank(${judgmentParas.tsv}, ${tsq}, 1)`;
  const ranked = db
    .select({
      judgmentId: judgmentParas.judgmentId,
      paraNo: judgmentParas.paraNo,
      text: judgmentParas.text,
      score: sql<number>`(${rank})::float8`.as("score"),
      rn: sql<number>`row_number() over (partition by ${judgmentParas.judgmentId} order by ${rank} desc, ${judgmentParas.paraNo})`.as("rn"),
      hits: sql<number>`(count(*) over (partition by ${judgmentParas.judgmentId}))::int`.as("hits"),
    })
    .from(judgmentParas)
    .innerJoin(judgments, eq(judgments.id, judgmentParas.judgmentId))
    .where(and(sql`${judgmentParas.tsv} @@ ${tsq}`, ...where))
    .as("ranked");
  const rows = await db
    .select({
      ...metaCols,
      paraNo: ranked.paraNo,
      hits: ranked.hits,
      score: ranked.score,
      snippet: sql<string>`ts_headline('english', ${ranked.text}, ${tsq}, ${HEADLINE_OPTS})`,
    })
    .from(ranked)
    .innerJoin(judgments, eq(judgments.id, ranked.judgmentId))
    .where(eq(ranked.rn, 1))
    .orderBy(desc(ranked.score), desc(judgments.decidedOn))
    .limit(limit);
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const { snippet, score: _s, ...rest } = r;
    void _s;
    results.push({ ...rest, snippetMarked: snippet.replace(/\s+/g, " ").trim(), hits: Number(r.hits), exact: false });
  }
  return results.slice(0, limit);
}

/** Newest judgments (by decision date), optionally filtered. */
export async function recentJudgments(opts?: { court?: string | null; year?: number | null; limit?: number }) {
  const where = filters(opts ?? {});
  return db
    .select({ ...metaCols, createdAt: judgments.createdAt })
    .from(judgments)
    .where(where.length ? and(...where) : undefined)
    .orderBy(sql`${judgments.decidedOn} desc nulls last`, desc(judgments.createdAt))
    .limit(Math.min(opts?.limit ?? 12, 50));
}

/** Courts in the library with judgment counts (for filters). */
export async function libraryCourts() {
  return db
    .select({ court: judgments.court, n: count() })
    .from(judgments)
    .groupBy(judgments.court)
    .orderBy(desc(count()), asc(judgments.court));
}

/** One judgment with all its paragraphs, or null. */
export async function getJudgment(id: string) {
  if (!isJudgmentId(id)) return null;
  const [j] = await db.select().from(judgments).where(eq(judgments.id, id)).limit(1);
  if (!j) return null;
  const paras = await db
    .select({ paraNo: judgmentParas.paraNo, text: judgmentParas.text })
    .from(judgmentParas)
    .where(eq(judgmentParas.judgmentId, id))
    .orderBy(asc(judgmentParas.paraNo));
  return { judgment: j, paras };
}

/* ------------------------------- admin ------------------------------- */

export async function listJudgmentsAdmin(opts: { q?: string; court?: string; page: number; pageSize: number }) {
  const conds: SQL[] = [];
  const q = opts.q?.trim().slice(0, 200);
  if (q) {
    const like = `%${likeEscape(q)}%`;
    const c = or(ilike(judgments.title, like), ilike(judgments.citation, like), ilike(judgments.caseNo, like), ilike(judgments.parties, like));
    if (c) conds.push(c);
  }
  if (opts.court) conds.push(eq(judgments.court, opts.court));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        ...metaCols,
        sourceKey: judgments.sourceKey,
        licence: judgments.licence,
        createdAt: judgments.createdAt,
        paraCount: sql<number>`(select count(*)::int from ${judgmentParas} where ${judgmentParas.judgmentId} = "judgments"."id")`,
      })
      .from(judgments)
      .where(where)
      .orderBy(desc(judgments.createdAt), desc(judgments.id))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ n: count() }).from(judgments).where(where),
  ]);
  return { rows, total: Number(total?.n ?? 0) };
}
