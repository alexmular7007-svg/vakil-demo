// Pure parts of the India Code sync: fingerprints, section parsing (the same pipeline
// as scripts/corpus/ingest.mjs + the seed, so unchanged acts produce no diff), section
// diffs and the safety check before applying them. No network and no database.
import { createHash } from "node:crypto";
import { handleUrl, htmlToFootnotes, htmlToParagraphs, meta } from "../../../scripts/corpus/lib/indiacode-text.mjs";
import { cleanHeading } from "../../../scripts/corpus/lib/parse-act-pdf.mjs";
import { listSectionNos, planSections, SYNC_SAFETY, unsafePlanReason, type SafetyLimits } from "@/lib/corpus/plan";
import { sectionText } from "@/lib/corpus/seed-corpus";
import { clip, squash } from "./text";
import type { RawEntry } from "./types";

export type DSpaceItem = {
  uuid: string;
  handle: string;
  name?: string;
  metadata: Record<string, { value: string | null }[] | undefined>;
};

export type Bitstream = { bundle: string; name: string; size: number; md5: string | null; url: string };

type BundlesJson = {
  _embedded?: {
    bundles?: {
      name: string;
      _embedded?: { bitstreams?: { _embedded?: { bitstreams?: { name: string; sizeBytes: number; checkSum?: { value?: string } | null; _links: { content: { href: string } } }[] } } };
    }[];
  };
};

export const md = (item: DSpaceItem, key: string): string | null => meta(item, key) as string | null;

export function bitstreamsFrom(json: BundlesJson): Bitstream[] {
  const out: Bitstream[] = [];
  for (const b of json._embedded?.bundles ?? []) {
    for (const bs of b._embedded?.bitstreams?._embedded?.bitstreams ?? []) {
      out.push({ bundle: b.name, name: bs.name, size: bs.sizeBytes, md5: bs.checkSum?.value ?? null, url: bs._links.content.href });
    }
  }
  return out;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Cheap fingerprint of an act on India Code: its "last modified" metadata plus the name,
 * size and MD5 of every original file (the official PDFs). Two requests per act.
 */
export function actFingerprint(actItem: DSpaceItem, streams: Bitstream[]): string {
  const files = streams
    .filter((b) => b.bundle === "ORIGINAL")
    .map((b) => `${b.name}:${b.size}:${b.md5 ?? ""}`)
    .sort();
  const basis = JSON.stringify({ lm: md(actItem, "dc.date.last_modified"), act: md(actItem, "dc.identifier.act_id"), files });
  return sha(basis).slice(0, 16);
}

/** sourceVersion is stored as "ic1:<fingerprint>:<sections hash>"; either part may be empty. */
export function parseVersion(v: string | null | undefined): { fp: string | null; sections: string | null } {
  const m = v?.match(/^ic1:([0-9a-f]*):([0-9a-f]*)$/);
  return m ? { fp: m[1] || null, sections: m[2] || null } : { fp: null, sections: null };
}

export function formatVersion(fp: string | null, sections: string | null): string {
  return `ic1:${fp ?? ""}:${sections ?? ""}`;
}

export type ParsedSection = { no: string; order: number; heading: string; text: string; sourceUrl: string | null };

const naturalKey = (no: string) => {
  const m = String(no).match(/^(\d+)([A-Z]*)$/);
  return m ? Number(m[1]) * 100 + (m[2] ? m[2].split("").reduce((a, c) => a * 27 + (c.charCodeAt(0) - 64), 0) % 100 : 0) : 0;
};

/**
 * SECTION records of a structured act → sections exactly as the seed stores them:
 * heading cleaned, paragraphs joined by blank lines, then the amendment footnotes.
 * The first record wins when a section number repeats, as in ingest.mjs.
 */
export function sectionsFromItems(items: DSpaceItem[]): ParsedSection[] {
  const seen = new Set<string>();
  const out: ParsedSection[] = [];
  for (const it of items) {
    if (md(it, "dc.identifier.collection") !== "SECTION") continue;
    const no = (md(it, "dc.identifier.section_number") ?? "").trim().toUpperCase();
    if (!no || seen.has(no)) continue;
    seen.add(no);
    const paragraphs = htmlToParagraphs(md(it, "dc.identifier.section_page_note")) as { text: string }[];
    const footnotes = (htmlToFootnotes(md(it, "dc.identifier.section_footnote")) as { text: string }[]).map((f) => f.text);
    out.push({
      no,
      order: Number(md(it, "dc.identifier.order_number") ?? 0) || naturalKey(no),
      heading: (cleanHeading(md(it, "dc.title") ?? "") as string) || `Section ${no}`,
      text: sectionText({ text: paragraphs.map((p) => p.text).join("\n\n"), footnotes }),
      sourceUrl: it.handle ? (handleUrl(it.handle) as string) : null,
    });
  }
  return out.sort((a, b) => a.order - b.order || naturalKey(a.no) - naturalKey(b.no));
}

/** Sections parsed from an act PDF (parse-act-pdf.mjs output) → the stored shape. */
export function sectionsFromPdfParse(parsed: { no: string; heading: string; paragraphs: { text: string }[]; footnotes: string[] }[], sourceUrl: string): ParsedSection[] {
  return parsed.map((s, i) => ({
    no: s.no,
    order: i + 1,
    heading: s.heading || `Section ${s.no}`,
    text: sectionText({ text: s.paragraphs.map((p) => p.text).join("\n\n"), footnotes: s.footnotes }),
    sourceUrl,
  }));
}

export function sectionsHash(sections: Pick<ParsedSection, "no" | "heading" | "text">[]): string {
  const lines = sections.map((s) => `${s.no}\t${s.heading.trim()}\t${s.text.trim()}`).sort();
  return sha(lines.join("\n")).slice(0, 16);
}

export type CurrentSection = { sectionNo: string; heading: string; text: string; chapter: string | null; sortKey: number };

export type SectionDiff = {
  added: ParsedSection[];
  changed: ParsedSection[];
  removed: string[];
  unchanged: number;
};

/**
 * What reviseSections would have to do to make the corpus match `next`: the shared
 * plan from src/lib/corpus/plan.ts (the admin paste preview uses the same function),
 * with every section missing from India Code counted as removed.
 */
export function diffSections(current: CurrentSection[], next: ParsedSection[], opts: { keep?: Iterable<string> } = {}): SectionDiff {
  const plan = planSections(current, next, (s) => ({ sectionNo: s.no, heading: s.heading, text: s.text }), { removeMissing: true, keep: opts.keep });
  return { added: plan.added, changed: plan.changed, removed: plan.removed, unchanged: plan.unchanged.length };
}

/**
 * Refuses diffs that look like a parsing failure rather than an amendment: far fewer
 * sections than before, or many removals at once (thresholds: SYNC_SAFETY in
 * src/lib/corpus/plan.ts). Returns the reason, or null if safe.
 */
export function unsafeDiffReason(diff: Pick<SectionDiff, "removed">, currentCount: number, nextCount: number, limits: SafetyLimits = SYNC_SAFETY): string | null {
  return unsafePlanReason(diff, currentCount, nextCount, { limits, source: "India Code" });
}

/** Chapter for a new section: the chapter of the section just before it in the new text. */
export function chapterForNew(next: ParsedSection[], current: CurrentSection[], no: string): string | null {
  const chapterOf = new Map(current.map((s) => [s.sectionNo, s.chapter]));
  const idx = next.findIndex((s) => s.no === no);
  for (let i = idx - 1; i >= 0; i--) {
    const c = chapterOf.get(next[i].no);
    if (c !== undefined) return c;
  }
  return null;
}

/** "s. 103, 104, 105A and 12 more" for summaries. */
export const sectionList = listSectionNos;

/** India Code discover search (ACT records) → "new central Act" entries. */
export function newActEntries(json: unknown, skipHandles: Set<string>): RawEntry[] {
  const objects =
    (json as { _embedded?: { searchResult?: { _embedded?: { objects?: { _embedded?: { indexableObject?: DSpaceItem } }[] } } } })._embedded?.searchResult?._embedded
      ?.objects ?? [];
  const out: RawEntry[] = [];
  for (const o of objects) {
    const it = o._embedded?.indexableObject;
    if (!it?.handle || md(it, "dc.identifier.collection") !== "ACT") continue;
    if (skipHandles.has(it.handle)) continue;
    const title = squash(md(it, "dc.title") ?? it.name ?? "").replace(/\.$/, "");
    if (!title) continue;
    const enacted = md(it, "dc.date.enact_date");
    const published = enacted && /^\d{4}-\d{2}-\d{2}$/.test(enacted) ? new Date(`${enacted}T00:00:00+05:30`) : null;
    const no = squash(md(it, "dc.identifier.act_number") ?? "").replace(/^0+(?=\d)/, "");
    const year = md(it, "dc.date.act_year");
    const longTitle = squash(md(it, "dc.title.long_title") ?? "");
    const ministry = squash(md(it, "dc.identifier.ministry_name") ?? "");
    out.push({
      title,
      url: handleUrl(it.handle) as string,
      summary: clip([no && year ? `Act No. ${no} of ${year}.` : "", longTitle].filter(Boolean).join(" "), 200) || null,
      publishedAt: published,
      categories: [ministry, "Central Act"].filter(Boolean),
    });
  }
  return out;
}

/** Handle part of an India Code URL ("https://indiacode.gov.in/handle/123456789/496548"). */
export function handleFromUrl(url: string | null | undefined): string | null {
  const m = url?.match(/^https?:\/\/(?:www\.)?indiacode\.(?:gov|nic)\.in\/handle\/(\d+\/\d+)/i);
  return m ? m[1] : null;
}
