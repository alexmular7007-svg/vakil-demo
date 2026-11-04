import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ACT_IDS, ACT_INFO, CODE_PAIRS, type ActId } from "./acts";

// Reads the committed bare-act JSON (data/corpus/*.json, produced by
// scripts/corpus/ingest.mjs). Used by the static public pages and the seed script;
// file reads are deterministic, so pages that use them prerender at build time.

export type Paragraph = { text: string; indent: number };

export type CorpusSection = {
  no: string;
  sortKey: number;
  heading: string;
  chapter: string | null;
  chapterNo: string | null;
  text: string;
  paragraphs: Paragraph[];
  footnotes: string[];
};

export type CorpusChapter = { number: string; title: string; sections: string[] };

export type CorpusAct = {
  id: ActId;
  title: string;
  shortTitle: string;
  actNo: string;
  year: number;
  enactedOn: string | null;
  inForceFrom: string | null;
  repealedOn: string | null;
  replacedBy: ActId | null;
  replaces: ActId | null;
  longTitle: string | null;
  category: string;
  source: { name: string; url: string; pdfUrl: string | null; method: string; retrievedOn: string };
  sourceNote: string;
  chapters: CorpusChapter[];
  sectionCount: number;
  sections: CorpusSection[];
};

export type CodeMapRow = { oldSection: string; newSection: string; subject: string | null; changed: boolean; details: string[] };
export type CodeMapPair = {
  oldAct: ActId;
  newAct: ActId;
  sourceUrl: string;
  sourceTitle: string;
  rows: CodeMapRow[];
  newProvisions: string[];
  deleted: { section: string; ref: string; text: string }[];
};
export type CodeMapFile = { generatedOn: string; publisher: string; pairs: CodeMapPair[] };

const DIR = path.join(process.cwd(), "data", "corpus");
const cache = new Map<string, unknown>();

function readJson<T>(file: string): T | null {
  if (cache.has(file)) return cache.get(file) as T;
  const full = path.join(DIR, file);
  if (!existsSync(full)) {
    cache.set(file, null);
    return null;
  }
  const data = JSON.parse(readFileSync(full, "utf8")) as T;
  cache.set(file, data);
  return data;
}

export function loadAct(id: ActId): CorpusAct | null {
  return readJson<CorpusAct>(`${id}.json`);
}

/** Acts present in data/corpus, in the canonical order. */
export function loadActs(): CorpusAct[] {
  return ACT_IDS.map((id) => loadAct(id)).filter((a): a is CorpusAct => a !== null);
}

export function loadCodeMap(): CodeMapFile | null {
  return readJson<CodeMapFile>("code-map.json");
}

export function findSection(act: CorpusAct, no: string): { section: CorpusSection; index: number } | null {
  const index = act.sections.findIndex((s) => s.no === no.toUpperCase());
  return index >= 0 ? { section: act.sections[index], index } : null;
}

/** Old↔new correspondence for one section, from the NCRB table. */
export function correspondenceFor(actId: ActId, sectionNo: string) {
  const map = loadCodeMap();
  const pair = CODE_PAIRS.find((p) => p.old === actId || p.new === actId);
  if (!map || !pair) return null;
  const table = map.pairs.find((p) => p.oldAct === pair.old && p.newAct === pair.new);
  if (!table) return null;
  const isOld = pair.old === actId;
  const rows = table.rows.filter((r) => (isOld ? r.oldSection === sectionNo : r.newSection === sectionNo));
  const otherAct = (isOld ? pair.new : pair.old) as ActId;
  const other = loadAct(otherAct);
  const matches = rows.map((r) => {
    const no = isOld ? r.newSection : r.oldSection;
    return { actId: otherAct, sectionNo: no, heading: other ? findSection(other, no)?.section.heading ?? null : null, details: r.details, changed: r.changed };
  });
  const isNew = !isOld && table.newProvisions.some((p) => p.split("(")[0] === sectionNo);
  const omitted = isOld ? table.deleted.filter((d) => d.section === sectionNo) : [];
  return { direction: isOld ? ("old-to-new" as const) : ("new-to-old" as const), otherAct, matches, isNew, omitted, sourceUrl: table.sourceUrl, sourceTitle: table.sourceTitle };
}

/** Compact data for the client-side converter: headings and correspondence rows only. */
export function converterData() {
  const map = loadCodeMap();
  const headings: Record<string, Record<string, string>> = {};
  for (const id of ["IPC", "BNS", "CRPC", "BNSS", "IEA", "BSA"] as ActId[]) {
    const act = loadAct(id);
    if (!act) continue;
    headings[id] = Object.fromEntries(act.sections.map((s) => [s.no, s.heading.length > 110 ? `${s.heading.slice(0, 109)}…` : s.heading]));
  }
  const pairs = (map?.pairs ?? []).map((p) => ({
    oldAct: p.oldAct,
    newAct: p.newAct,
    sourceUrl: p.sourceUrl,
    rows: p.rows.map((r) => [r.oldSection, r.newSection, r.changed ? 1 : 0, r.details.join("; ")] as [string, string, 0 | 1, string]),
    newProvisions: p.newProvisions,
    deleted: [...new Set(p.deleted.map((d) => d.section))],
  }));
  return { headings, pairs, generatedOn: map?.generatedOn ?? null };
}
export type ConverterData = ReturnType<typeof converterData>;

export function actLabel(id: ActId) {
  return ACT_INFO[id];
}
