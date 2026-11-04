// Splits the pasted text of a whole act into sections for the admin "Paste full
// act text" preview, and prepares statute text for the revision diff. Pure
// functions, safe for client and server. Nothing is saved from here: the admin
// confirms the preview and every section then goes through reviseSection.

import { titleCase } from "@/lib/judgments/text";

export type ParsedSection = {
  sectionNo: string;
  heading: string;
  text: string;
  chapter: string | null;
  /** 1-based line of the section heading in the pasted text. */
  line: number;
};

export type ActTextResult = { sections: ParsedSection[]; warnings: string[] };

export const MAX_ACT_SECTIONS = 2000;

// "1. Short title…", "3A. …", "Section 4. …", "¹[3A. …" (India Code footnote markers).
const SECTION_START = /^(?:[\d⁰¹²³⁴⁵⁶⁷⁸⁹]{1,2}\[)?(?:Section|Sec\.?)?\s*(\d{1,3})([A-Z]{0,3})\.\s*(\S.*)?$/;
const CHAPTER = /^CHAPTER\s+([IVXLCDM]+[A-Z]?|\d{1,3}[A-Z]?)\b\.?\s*[-—–:]?\s*(.*)$/i;
const CLAUSE = /^(?:\(\d{1,3}[A-Z]{0,2}\)|\([a-z]{1,2}\)|\((?:[ivxl]{1,6})\)|(?:Explanation|Illustrations?|Provided|Exception|Note)\b)/;

function isUpperTitle(l: string) {
  return /[A-Z]{3}/.test(l) && l === l.toUpperCase() && l.length <= 160;
}

/** Number and suffix order: 3 < 3A < 3B < 4. */
function isAfter(prev: { n: number; s: string } | null, n: number, s: string) {
  if (!prev) return true;
  if (n === prev.n) return s > prev.s;
  return n > prev.n && n <= prev.n + 25;
}

function splitHeading(rest: string): { heading: string; first: string } {
  const dash = /^(.{2,250}?)(?:\.\s*[—–-]+|:\s*[—–-]+|\s*[—–]+)\s*(.*)$/.exec(rest);
  if (dash) return { heading: dash[1].trim(), first: dash[2].trim() };
  const onlyHeading = /^(.{2,250}?)\.?$/.exec(rest);
  if (onlyHeading && rest.length <= 250 && !/\.\s+\S/.test(rest)) return { heading: onlyHeading[1].trim(), first: "" };
  const sentence = /^(.{2,200}?)\.\s+([A-Z(“"].*)$/.exec(rest);
  if (sentence) return { heading: sentence[1].trim(), first: sentence[2].trim() };
  return { heading: rest.replace(/\.$/, "").trim(), first: "" };
}

/** Joins wrapped lines; sub-sections, clauses, provisos and explanations start new paragraphs. */
function sectionBody(lines: string[]): string {
  const paras: string[] = [];
  let cur = "";
  let gap = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) {
      gap = true;
      continue;
    }
    if (!cur) cur = l;
    else if (CLAUSE.test(l) || gap) {
      paras.push(cur);
      cur = l;
    } else if (/[A-Za-z]-$/.test(cur) && /^[a-z]/.test(l)) cur += l;
    else cur += ` ${l}`;
    gap = false;
  }
  if (cur) paras.push(cur);
  return paras.join("\n\n");
}

/**
 * Finds numbered sections ("1. Short title.—…", "2. …", "3A. …") in pasted act
 * text. Numbers must run forward (3, 3A, 4 …), so numbered lists inside a section
 * are not mistaken for new sections. Chapter headings ("CHAPTER II" + title) are
 * carried onto the sections that follow them.
 */
export function splitActText(raw: string): ActTextResult {
  const lines = raw.replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim());
  const warnings: string[] = [];
  type Open = { sectionNo: string; heading: string; body: string[]; chapter: string | null; line: number };
  const out: ParsedSection[] = [];
  let open: Open | null = null;
  let chapter: string | null = null;
  let prev: { n: number; s: string } | null = null;
  let preamble = false;

  const close = () => {
    if (!open) return;
    const text = sectionBody(open.body);
    out.push({ sectionNo: open.sectionNo, heading: open.heading, text: text || open.heading, chapter: open.chapter, line: open.line });
    open = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const ch = CHAPTER.exec(l);
    if (ch) {
      close();
      let title = ch[2].trim();
      if (!title) {
        const next = lines.slice(i + 1).find((x) => x);
        if (next && !SECTION_START.test(next) && isUpperTitle(next)) {
          title = next;
          i = lines.indexOf(next, i + 1);
        }
      }
      chapter = `Chapter ${ch[1].toUpperCase()}${title ? `: ${titleCase(title.replace(/\.$/, ""))}` : ""}`;
      continue;
    }
    const m = SECTION_START.exec(l);
    if (m && m[3] && isAfter(prev, Number(m[1]), m[2])) {
      close();
      const { heading, first } = splitHeading(m[3]);
      open = { sectionNo: `${m[1]}${m[2]}`, heading, body: first ? [first] : [], chapter, line: i + 1 };
      prev = { n: Number(m[1]), s: m[2] };
      continue;
    }
    if (open) (open as Open).body.push(l);
    else if (l) preamble = true;
  }
  close();

  if (preamble && out.length) warnings.push("Text before the first section (the act's title or preamble) was left out.");
  const seen = new Set<string>();
  const sections = out.filter((s) => {
    if (seen.has(s.sectionNo)) {
      warnings.push(`Section ${s.sectionNo} appears twice; only the first is kept (line ${s.line}).`);
      return false;
    }
    seen.add(s.sectionNo);
    return true;
  });
  const headingOnly = sections.filter((s) => s.text === s.heading);
  if (headingOnly.length) {
    warnings.push(`${headingOnly.length === 1 ? "Section" : "Sections"} ${headingOnly.map((s) => s.sectionNo).join(", ")} had no text after the heading; the heading is used as the text.`);
  }
  if (sections.length > MAX_ACT_SECTIONS) warnings.push(`Only the first ${MAX_ACT_SECTIONS} sections are kept.`);
  return { sections: sections.slice(0, MAX_ACT_SECTIONS), warnings };
}

/**
 * Lines for the before/after diff of a section: each paragraph, further split at
 * sentence ends so a one-word amendment shows as one changed sentence.
 */
export function revisionLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .flatMap((p) => p.replace(/([.;:—])\s+(?=[A-Z(“"])/g, "$1\n").split("\n"))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
