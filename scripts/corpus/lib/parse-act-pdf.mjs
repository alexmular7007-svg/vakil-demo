// Parse an India Code act PDF (already split into lines by pdf-lines.mjs):
//  1. the Arrangement of Sections gives the ordered list of sections, their
//     headings and chapters;
//  2. each section is then located in the body by anchored, in-order search, so a
//     number appearing inside text (or inside a State amendment) is never taken
//     for a section start.

const ROMAN = /^[IVXLC]+[A-Z]{0,2}$/;
const SUP_CHARS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const SUP_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g;
const FROM_SUP = Object.fromEntries([...SUP_CHARS].map((c, i) => [c, String(i)]));
const supToInt = (s) => Number([...s].map((c) => FROM_SUP[c]).join(""));
const toSup = (n) => String(n).replace(/\d/g, (d) => SUP_CHARS[Number(d)]);

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with", "under", "against"]);

export function titleCase(s) {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.replace(/^([“"'(]*)(\p{L})/u, (_, p, c) => p + c.toUpperCase())))
    .join("")
    .replace(/([—–]\s*)(\p{Ll})/gu, (_, d, c) => d + c.toUpperCase())
    .replace(/\bIndia\b/gi, "India");
}

/** Strip leading footnote markers and amendment brackets: "⁹[4. Extension" → "4. Extension". */
function stripLead(text) {
  return text.replace(/^(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*)?(?:\[\s*)?/, "").replace(/^(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*\[\s*)+/, "");
}

const norm = (s) =>
  s
    .toLowerCase()
    .replace(SUP_RE, "")
    .replace(/[^a-z0-9]+/g, "");

const SECTION_LINE = /^(\d{1,3}[A-Z]{0,3})\s*\.\s*(.*)$/;
// Some bodies drop the full stop ("¹[17 “Government”.—"); only used together with a heading match.
const SECTION_LINE_LOOSE = /^(\d{1,3}[A-Z]{0,3})\s*\.?\s+(.*)$/;
const CHAPTER_LINE = /^(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]*\[)?\s*CHAPTER\s*\.?\s*([IVXLC]+[A-Z]{0,2})\b\.?\s*(.*)$/;

/** Flatten pages into one line stream; returns index of the first body line (after the TOC). */
export function flatten(pages) {
  const lines = [];
  for (const pg of pages) for (const l of pg.lines) lines.push({ ...l, pageInfo: pg });
  return lines;
}

/**
 * Parse the Arrangement of Sections.
 * @returns {{ entries: {no:string, heading:string, chapterNo:string|null, chapterTitle:string|null}[],
 *   chapters: {number:string, title:string}[], bodyStart:number }}
 */
export function parseToc(lines) {
  // Tolerates the "ARRENGMENT" misprint in some India Code PDFs.
  let i = lines.findIndex((l) => /ARR[AE]NGE?MENT\s+OF\s+SECTIONS/i.test(l.text));
  if (i < 0) throw new Error("No 'ARRANGEMENT OF SECTIONS' found");
  // Body starts at the "ACT NO. x OF yyyy" line that follows the arrangement.
  const bodyStart = lines.findIndex((l, k) => k > i && /^ACT\s*NO\.?\s*\d+/i.test(l.text.replace(SUP_RE, "")));
  if (bodyStart < 0) throw new Error("Could not find the start of the enacted text (ACT NO. …)");

  const entries = [];
  const chapters = [];
  let chapter = null;
  let awaitingChapterTitle = false;
  let current = null;
  for (let k = i + 1; k < bodyStart; k++) {
    const t = lines[k].text.trim();
    if (!t || /^_+$/.test(t) || /^SECTIONS?$/i.test(t) || /^ARRANGEMENT/i.test(t)) continue;
    if (/^(THE\s+)?([A-Z]+\s+)?SCHEDULES?\b/.test(t) || /^FORM\s*NO/i.test(t)) break;
    const ch = t.match(CHAPTER_LINE);
    if (ch && ROMAN.test(ch[1])) {
      chapter = { number: ch[1], title: ch[2].replace(/^[–—-]+\s*/, "").replace(/\.\s*$/, "").trim() };
      chapters.push(chapter);
      awaitingChapterTitle = !chapter.title;
      current = null;
      continue;
    }
    const sm = stripLead(t).match(SECTION_LINE);
    if (sm) {
      awaitingChapterTitle = false;
      current = { no: sm[1], heading: sm[2].trim(), chapterNo: chapter?.number ?? null, chapterTitle: chapter?.title ?? null };
      entries.push(current);
      continue;
    }
    if (awaitingChapterTitle && chapter) {
      // Titles are set in capitals; a mixed-case line is a sub-heading, not part of the title.
      if (/[a-z]/.test(t) && chapter.title) {
        awaitingChapterTitle = false;
        continue;
      }
      const piece = t.replace(/^[–—-]+\s*/, "").replace(/\.\s*$/, "");
      chapter.title = chapter.title ? `${chapter.title} ${piece}` : piece;
      continue;
    }
    if (current && !/[.\]]\s*$/.test(current.heading)) {
      current.heading = `${current.heading} ${t}`.replace(/\s+/g, " ");
    }
  }
  for (const e of entries) {
    const c = chapters.find((x) => x.number === e.chapterNo);
    e.chapterTitle = c?.title ?? null;
  }
  return { entries, chapters, bodyStart };
}

function isCentered(l) {
  const pg = l.pageInfo;
  const mid = (pg.left + pg.right) / 2;
  const width = pg.right - pg.left;
  return l.x0 > pg.left + 40 && l.x1 - l.x0 < width * 0.75 && Math.abs((l.x0 + l.x1) / 2 - mid) < 25;
}

function isHeadingLine(l, prev) {
  const t = l.text.trim();
  if (CHAPTER_LINE.test(t)) return true;
  if (prev && CHAPTER_LINE.test(prev.text.trim()) && !/[a-z]/.test(t)) return true;
  if (isCentered(l) && t.length < 100 && !/[.:;,—\]]$/.test(t) && !/^(illustrations?|state amendments?|explanations?)$/i.test(t)) return true;
  if (/^(THE\s+)?([A-Z]+\s+)?SCHEDULE\b/.test(t) && isCentered(l)) return true;
  return false;
}

/** Find where each TOC entry starts in the body. */
function locateSections(lines, entries, bodyStart) {
  const starts = [];
  let cursor = bodyStart;
  const missing = [];
  for (const e of entries) {
    const wantHead = norm(e.heading).slice(0, 14);
    let found = -1;
    const limit = Math.min(lines.length, cursor + 1200);
    for (const strict of [true, false]) {
      for (let k = cursor; k < limit; k++) {
        const raw = stripLead(lines[k].text.trim());
        const m = raw.match(strict ? SECTION_LINE_LOOSE : SECTION_LINE);
        if (!m || m[1] !== e.no) continue;
        if (strict) {
          const rest = norm(m[2]);
          const omitted = /omitted|repealed|rep\b/i.test(e.heading);
          if (!(wantHead && rest.startsWith(wantHead.slice(0, Math.min(10, wantHead.length)))) && !(omitted && rest.length >= 0)) continue;
        } else if (k > cursor + 200) break;
        found = k;
        break;
      }
      if (found >= 0) break;
    }
    if (found < 0) {
      missing.push(e.no);
      starts.push(-1);
      continue;
    }
    starts.push(found);
    cursor = found + 1;
  }
  return { starts, missing };
}

/** Join a section's lines into paragraphs using indentation and short-line breaks. */
function reflow(block) {
  const paras = [];
  let cur = null;
  let prev = null;
  for (const l of block) {
    const pg = l.pageInfo;
    const t = l.text.trim();
    const indented = l.x0 > pg.left + 6;
    const sizeChange = prev && Math.abs(prev.size - l.size) >= 1.5;
    const prevShort = prev && prev.x1 < prev.pageInfo.right - 28;
    // A first line is indented relative to the block; continuation lines return to its margin.
    const deeper = prev && l.x0 > prev.x0 + 4;
    // Clause boundaries end in punctuation; a deeper line after a full-width line that does not
    // is just a continuation laid out oddly.
    const prevEndsClause = prev && /[.;:—–-]["”’)\]]*$|\bor$|\band$/.test(prev.text.trim());
    const startsBlock = /^(\(\w{1,5}\)|Explanation|Illustrations?\b|Provided|Exception|STATE AMENDMENTS?)/.test(t);
    const newPara = !cur || sizeChange || prevShort || (deeper && prevEndsClause) || (startsBlock && indented && prevEndsClause);
    if (newPara) {
      cur = { lines: [t], indent: Math.max(0, Math.round((l.x0 - pg.left) / 18) - 1), size: l.size };
      paras.push(cur);
    } else {
      const last = cur.lines[cur.lines.length - 1];
      if (/[A-Za-z]-$/.test(last) && /^[a-z]/.test(t)) cur.lines[cur.lines.length - 1] = last + t;
      else cur.lines.push(t);
    }
    prev = l;
  }
  return paras.map((p) => ({ text: p.lines.join(" ").replace(/\s+/g, " ").replace(/\s+([,;:])/g, "$1").trim(), indent: Math.min(p.indent, 4) }));
}

/** Parse the body into sections with text paragraphs and per-section footnotes. */
export function parseBody(lines, toc) {
  const { entries, bodyStart } = toc;
  const { starts, missing } = locateSections(lines, entries, bodyStart);
  const sections = [];
  // End of the last section: first centred SCHEDULE heading after it, or end of document.
  const lastStart = Math.max(...starts);
  let docEnd = lines.length;
  for (let k = lastStart + 1; k < lines.length; k++) {
    const t = lines[k].text.replace(SUP_RE, "").replace(/^\[/, "").trim();
    if (/^(THE\s+)?([A-Z]+\s+)?SCHEDULES?\b/.test(t) && !/[a-z]/.test(t)) {
      docEnd = k;
      break;
    }
  }
  for (let idx = 0; idx < entries.length; idx++) {
    const e = entries[idx];
    const s = starts[idx];
    if (s < 0) continue;
    let end = docEnd;
    for (let j = idx + 1; j < entries.length; j++) if (starts[j] > s) { end = starts[j]; break; }
    let block = lines.slice(s, end);
    // Trim trailing chapter / sub-chapter headings that belong to the next section.
    while (block.length > 1 && isHeadingLine(block[block.length - 1], block[block.length - 2])) block = block.slice(0, -1);
    // The chapter line itself may carry an amendment marker ("³[CHAPTER VA") — drop stray ones mid-block.
    block = block.filter((l, k) => !(k > 0 && CHAPTER_LINE.test(l.text.trim())));

    // Renumber footnote markers per section (page footnotes restart at 1 on every page).
    const notes = [];
    const key = new Map();
    const renum = block.map((l) => ({
      ...l,
      text: l.text.replace(SUP_RE, (m) => {
        const n = supToInt(m);
        const fn = l.pageInfo.footnotes.get(n);
        if (!fn) return m;
        const k = `${l.page}:${n}`;
        if (!key.has(k)) {
          notes.push(fn.replace(/\s+/g, " ").trim());
          key.set(k, notes.length);
        }
        return toSup(key.get(k));
      }),
    }));

    const paras = reflow(renum);
    // First paragraph: "<markers>N. Heading.—Text" → "<markers>Text".
    if (paras.length) {
      const first = paras[0];
      const m = first.text.match(/^((?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*\[\s*)*)(\d{1,3}[A-Z]{0,3})(?:\s*\.\s*|\s+(?=[“"A-Z[]))([\s\S]*)$/);
      if (m) {
        const rest = m[3];
        const dash = rest.search(/\.?\s*[—–]+\s*/);
        let body = rest;
        if (dash >= 0 && dash < 260) body = rest.slice(dash).replace(/^\.?\s*[—–]+\s*/, "");
        first.text = `${m[1].replace(/\s+/g, "")}${body}`.trim();
        first.indent = 0;
        if (!first.text) paras.shift();
      }
    }
    sections.push({
      no: e.no,
      heading: cleanHeading(e.heading),
      chapterNo: e.chapterNo,
      paragraphs: paras.filter((p) => p.text),
      footnotes: notes,
    });
  }
  return { sections, missing };
}

export function cleanHeading(h) {
  let s = h.replace(SUP_RE, "").replace(/\s+/g, " ").trim();
  if (/^\[?\s*(omitted|repealed)\s*\.?\s*\]?\.?$/i.test(s)) return /omitted/i.test(s) ? "[Omitted]" : "[Repealed]";
  s = s.replace(/\s*\.\s*$/, "").replace(/\s*\.\]$/, "]");
  return s;
}

/** Chapter titles as printed in the body (often cleaner than the arrangement). */
export function bodyChapterTitles(lines, bodyStart) {
  const out = new Map();
  for (let k = bodyStart; k < lines.length; k++) {
    const m = lines[k].text.trim().match(CHAPTER_LINE);
    if (!m || !ROMAN.test(m[1])) continue;
    let title = m[2].replace(/^[–—-]+\s*/, "").trim();
    for (let j = k + 1; j < Math.min(lines.length, k + 4); j++) {
      const t = lines[j].text.trim();
      if (/[a-z]/.test(t.replace(SUP_RE, "")) || SECTION_LINE.test(stripLead(t))) break;
      title = title ? `${title} ${t}` : t;
    }
    title = title.replace(SUP_RE, "").replace(/[[\]]/g, "").replace(/\s+/g, " ").replace(/^[–—-]+\s*/, "").replace(/\.\s*$/, "").trim();
    if (title && !out.has(m[1])) out.set(m[1], title);
  }
  return out;
}

/**
 * Typeset PDFs sometimes lose a word space ("CRIMINALCONSPIRACY"). When the arrangement
 * and the body print the same title, keep every space either of them has.
 */
export function mergeTitles(a, b) {
  b = b ? b.replace(/\*+/g, " ").replace(/\s+/g, " ").trim() : b;
  if (!a) return b ?? "";
  if (!b) return a;
  const squash = (s) => s.replace(/\s+/g, "");
  if (squash(a) !== squash(b)) return b;
  const positions = (s) => {
    const set = new Set();
    let idx = 0;
    for (const ch of s) {
      if (/\s/.test(ch)) set.add(idx);
      else idx++;
    }
    return set;
  };
  const pa = positions(a);
  const pb = positions(b);
  const flat = squash(a);
  const all = [...new Set([...pa, ...pb])].sort((x, y) => x - y);
  // A space only one source has, that would leave a one-letter fragment, is a small-caps artefact ("A FFECTING").
  const keep = all.filter((pos, i) => {
    if (pa.has(pos) && pb.has(pos)) return true;
    const prevPos = i > 0 ? all[i - 1] : 0;
    const nextPos = i + 1 < all.length ? all[i + 1] : flat.length;
    return pos - prevPos > 1 && nextPos - pos > 1;
  });
  let out = "";
  for (let i = 0; i < flat.length; i++) {
    if (keep.includes(i) && out) out += " ";
    out += flat[i];
  }
  return out;
}
