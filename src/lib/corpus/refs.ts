// Recognises direct section references in a search query: "s. 103 BNS",
// "section 302 IPC", "BNSS 480", "u/s 498A IPC", "Sec. 482 Cr.P.C.", "498A".
// Pure and safe for client and server.
import { findActMentions, type ActId } from "./acts";

export type SectionRef = {
  actId: ActId | null;
  sectionNo: string;
  /** Sub-section / clause as written, e.g. "(1)(a)". */
  sub: string | null;
};

// A section number: 1–3 digits plus optional capital letters (120A, 376AB), optionally
// followed by sub-section brackets. Four-digit numbers (years) are never section numbers.
const NUM = /(?<![\w])(\d{1,3}[A-Za-z]{0,3})((?:\s?\(\s?[0-9a-zA-Z]{1,5}\s?\))*)(?![\w])/g;
const SECTION_WORD = /(?:\bsections?\b|\bsecs?\b\.?|\bss?\.|\bu\/s\.?|\bu\/ss\.?)\s*$/i;

/** Letters after the digits are only part of the number when they look like a section suffix. */
function cleanNo(raw: string): string | null {
  const m = raw.match(/^(\d{1,3})([A-Za-z]{0,3})$/);
  if (!m) return null;
  const letters = m[2];
  // "302ipc" style is rare; "3rd"/"1st"/"2nd" are ordinals, not sections.
  if (/^(st|nd|rd|th)$/i.test(letters)) return null;
  return `${Number(m[1])}${letters.toUpperCase()}`;
}

export function parseSectionRefs(query: string, maxRefs = 5): SectionRef[] {
  const q = query.slice(0, 300);
  const mentions = findActMentions(q);
  const refs: SectionRef[] = [];
  const seen = new Set<string>();
  const tokenCount = q.trim().split(/\s+/).filter(Boolean).length;

  for (const m of q.matchAll(NUM)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const no = cleanNo(m[1]);
    if (!no) continue;
    // Skip numbers that sit inside an act mention ("Act 45 of 2023") or right after "of".
    if (mentions.some((a) => start >= a.start && end <= a.end)) continue;
    if (/\bof\s*$/i.test(q.slice(Math.max(0, start - 4), start)) && !SECTION_WORD.test(q.slice(0, start))) continue;

    // Nearest act mention within a short distance, preferring one directly after the number.
    let best: { actId: ActId; d: number } | null = null;
    for (const a of mentions) {
      const gap = a.start >= end ? q.slice(end, a.start) : q.slice(a.end, start);
      if (gap.length > 24 || /[;]/.test(gap)) continue;
      // Only filler words between the number and the act name.
      if (!/^[\s,.:\-–]*(?:(?:of|the|under|u\/s|section|sec\.?|s\.)\s*)*[\s,.:\-–]*$/i.test(gap)) continue;
      const d = gap.length + (a.start >= end ? 0 : 1);
      if (!best || d < best.d) best = { actId: a.actId, d };
    }
    const hasSectionWord = SECTION_WORD.test(q.slice(0, start));
    const lettered = /[A-Z]$/.test(no);
    // Without an act, accept only clear references: "section 302", "498A", or a bare number query.
    if (!best && !hasSectionWord && !lettered && tokenCount > 1) continue;

    const sub = m[2] ? m[2].replace(/\s+/g, "") : null;
    const key = `${best?.actId ?? "*"}:${no}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ actId: best?.actId ?? null, sectionNo: no, sub: sub || null });
    if (refs.length >= maxRefs) break;
  }

  // "section 302 and 307 IPC": an act named once applies to the numbers before it.
  const named = refs.find((r) => r.actId);
  if (named && mentions.length === 1) for (const r of refs) if (!r.actId) r.actId = named.actId;
  return refs;
}

/** True when the query is nothing but a reference ("s. 103 BNS"), so full-text search adds little. */
export function isPureReference(query: string): boolean {
  let s = query;
  for (const m of findActMentions(s).reverse()) s = `${s.slice(0, m.start)} ${s.slice(m.end)}`;
  s = s.replace(/\b(sections?|secs?|ss?|u\/ss?|under|of|the|and|act)\b\.?/gi, " ");
  s = s.replace(/\d{1,3}[A-Za-z]{0,3}(\s?\(\s?[0-9a-zA-Z]{1,5}\s?\))*/g, " ");
  return s.replace(/[\s.,:;/\-–&]+/g, "") === "";
}
