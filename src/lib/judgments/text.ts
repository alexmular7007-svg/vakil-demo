// Turns extracted judgment text into numbered paragraphs, and guesses metadata
// from the first page. Pure functions, safe for client and server.

export type JudgmentPara = {
  /** The judgment's own paragraph number; 0 = text before paragraph 1 (cause title, headnote). */
  paraNo: number;
  text: string;
};

export type SplitResult = {
  paras: JudgmentPara[];
  /** "numbered" = the judgment's own numbering ("1.", "12."); "blocks" = split on blank lines. */
  mode: "numbered" | "blocks";
};

/** Hard caps so a malformed upload cannot create an unbounded number of rows. */
export const MAX_PARAS = 3000;
const MAX_BLOCK_CHARS = 6000;
const TARGET_PIECE_CHARS = 2500;

/** Whole lines that are page furniture rather than judgment text. */
const FURNITURE: RegExp[] = [
  /^(?:page\s*)?[-–—([]?\s*\d{1,3}\s*[-–—)\]]?$/i, // "12", "- 12 -", "Page 12", "(12)"
  /^(?:page\s+)?\d{1,4}\s*(?:of|\/)\s*\d{1,4}$/i, // "Page 3 of 18", "3/18"
  /^signature\s+not\s+verified$/i,
  /^digitally\s+signed\s+by\b/i,
  /^date:\s*\d{4}[.-]\d{2}[.-]\d{2}\b/i, // digital-signature stamp
  /^reason:?$/i,
  /^†?\s*headnotes?\s+prepared\s+by\b/i,
];

const PARA_START = /^(\d{1,3})\s?[.)](?:\s+|(?=[A-Z“"‘']))(?=\S)/;

function lineKey(line: string) {
  return line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
}

/**
 * Removes running headers and footers: short lines that repeat at the top or bottom
 * of two or more pages (three when they contain no digits), plus page numbers and
 * digital-signature stamps. Lines that start a numbered paragraph are never removed.
 */
export function stripPageFurniture(text: string): string {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .split(/\n[ \t]*\n/)
    .map((b) => b.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()));

  const edgeCount = new Map<string, number>();
  const isCandidate = (l: string | undefined) => Boolean(l) && l!.length <= 140 && !PARA_START.test(l!);
  for (const lines of blocks) {
    const nonEmpty = lines.filter(Boolean);
    const edges = new Set<string>();
    for (const l of [nonEmpty[0], nonEmpty[1], nonEmpty[nonEmpty.length - 2], nonEmpty[nonEmpty.length - 1]]) {
      if (isCandidate(l)) edges.add(lineKey(l!));
    }
    for (const k of edges) edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
  }
  const repeated = (l: string) => {
    const n = edgeCount.get(lineKey(l)) ?? 0;
    return /\d/.test(l) ? n >= 2 : n >= 3;
  };

  const out = blocks.map((lines) => {
    const nonEmptyIdx = lines.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
    const edgeIdx = new Set([nonEmptyIdx[0], nonEmptyIdx[1], nonEmptyIdx[nonEmptyIdx.length - 2], nonEmptyIdx[nonEmptyIdx.length - 1]]);
    return lines
      .filter((l, i) => {
        if (!l) return true;
        if (FURNITURE.some((re) => re.test(l))) return false;
        if (edgeIdx.has(i) && isCandidate(l) && repeated(l)) return false;
        return true;
      })
      .join("\n")
      .trim();
  });
  return out.filter(Boolean).join("\n\n");
}

const LIST_ITEM = /^(?:\((?:[a-z]{1,2}|[ivxl]{1,6}|\d{1,3}[a-z]?)\)|[ivxl]{1,6}\)|[a-z]\)|[•▪◦●-]\s)/i;
const ENDS_SENTENCE = /[.:;?!"”’)\]]$/;

/** Joins hard-wrapped lines into running text, keeping list items on their own lines. */
export function unwrapLines(lines: string[]): string {
  let out = "";
  let gap = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) {
      gap = true;
      continue;
    }
    if (!out) out = l;
    else if (LIST_ITEM.test(l) || (gap && ENDS_SENTENCE.test(out))) out += `\n${l}`;
    else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(l)) out += l;
    else out += ` ${l}`;
    gap = false;
  }
  return out.trim();
}

function hasWords(s: string) {
  return (s.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 2;
}

/** Splits an over-long block at sentence ends into pieces of about TARGET_PIECE_CHARS. */
function splitLong(text: string): string[] {
  if (text.length <= MAX_BLOCK_CHARS) return [text];
  const sentences = text.match(/[^.?!]+(?:[.?!]+["”’)]?\s+|$)/g) ?? [text];
  const pieces: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > TARGET_PIECE_CHARS) {
      pieces.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) pieces.push(cur.trim());
  // A single "sentence" longer than the cap (no full stops): cut at spaces.
  return pieces.flatMap((p) => {
    if (p.length <= MAX_BLOCK_CHARS) return [p];
    const parts: string[] = [];
    let rest = p;
    while (rest.length > TARGET_PIECE_CHARS) {
      const cut = rest.lastIndexOf(" ", TARGET_PIECE_CHARS);
      const at = cut > TARGET_PIECE_CHARS / 2 ? cut : TARGET_PIECE_CHARS;
      parts.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) parts.push(rest);
    return parts;
  });
}

/**
 * A PDF page has no blank lines between paragraphs; a short line that ends a
 * sentence and is followed by a capitalised line usually ends a paragraph.
 */
function splitPageBlock(lines: string[]): string[][] {
  if (lines.length < 8) return [lines];
  const lengths = lines.map((l) => l.length).sort((a, b) => a - b);
  const typical = lengths[Math.floor(lengths.length * 0.75)];
  const groups: string[][] = [[]];
  lines.forEach((l, i) => {
    groups[groups.length - 1].push(l);
    const next = lines[i + 1];
    if (next && l.length < typical * 0.7 && /[.:]["”’)]?$/.test(l) && /^[A-Z“"‘'(]/.test(next)) groups.push([]);
  });
  return groups.filter((g) => g.length);
}

function looksLikeOpinionStart(prev: string | undefined) {
  if (!prev) return false;
  const p = prev.trim();
  return /\bJ\.?\s*:?$/.test(p) || /^(?:JUDGMENT|ORDER|OPINION)\b/i.test(p) || (p.length <= 60 && p === p.toUpperCase() && /[A-Z]{3}/.test(p));
}

/**
 * Splits judgment text into paragraphs. When the judgment numbers its paragraphs
 * ("1.", "2." … at the start of a line), those numbers are kept so citations such
 * as "para 12" match the original; text before paragraph 1 becomes paragraph 0.
 * Otherwise paragraphs are split on blank lines (and paragraph-ending short lines
 * of PDF pages) and numbered from 1. Page headers, footers and page numbers are
 * dropped first.
 */
export function splitJudgmentParas(raw: string): SplitResult {
  const cleaned = stripPageFurniture(raw);
  const lines = cleaned.split("\n");

  // 1. The judgment's own numbering: a chain 1, 2, 3 … (gaps of up to two allowed).
  type Mark = { i: number; n: number; restart: boolean };
  const chain: Mark[] = [];
  let expected = 1;
  let prevNonEmpty: string | undefined;
  lines.forEach((line, i) => {
    const m = PARA_START.exec(line);
    if (m) {
      const n = Number(m[1]);
      if (n >= expected && n <= expected + 2) {
        chain.push({ i, n, restart: false });
        expected = n + 1;
      } else if (n === 1 && expected > 4 && looksLikeOpinionStart(prevNonEmpty)) {
        // A separate opinion that restarts its numbering at 1.
        chain.push({ i, n, restart: true });
        expected = 2;
      }
    }
    if (line.trim()) prevNonEmpty = line;
  });

  if (chain.length >= 2) {
    const paras: JudgmentPara[] = [];
    let preEnd = chain[0].i;
    // Some judgments leave paragraph 1 unnumbered ("Sanjiv Khanna, J." then the
    // first paragraph, then "2."): take the text after the author line as para 1.
    let firstPara: string | null = null;
    if (chain[0].n === 2) {
      for (let k = preEnd - 1; k >= 0 && k >= preEnd - 60; k--) {
        const l = lines[k].trim();
        if (/^(?:JUDGMENT|ORDER|J\s*U\s*D\s*G\s*M\s*E\s*N\s*T)\s*:?$/i.test(l) || (/\bJ\.?\s*:?$/.test(l) && l.length <= 80)) {
          const text = unwrapLines(lines.slice(k + 1, preEnd));
          if (hasWords(text)) {
            firstPara = text;
            preEnd = k + 1;
          }
          break;
        }
      }
    }
    const pre = unwrapLines(lines.slice(0, preEnd));
    if (hasWords(pre)) paras.push({ paraNo: 0, text: pre });
    if (firstPara) paras.push({ paraNo: 1, text: firstPara });
    let offset = 0;
    let last = 0;
    chain.forEach((mark, k) => {
      if (mark.restart) offset = last;
      const end = k + 1 < chain.length ? chain[k + 1].i : lines.length;
      const body = lines.slice(mark.i, end);
      // The number moves to paraNo; a restarted opinion keeps its own number visible.
      if (!mark.restart && offset === 0) body[0] = body[0].replace(PARA_START, "");
      const text = unwrapLines(body);
      const paraNo = offset + mark.n;
      last = paraNo;
      if (hasWords(text)) paras.push({ paraNo, text });
    });
    return { paras: paras.slice(0, MAX_PARAS), mode: "numbered" };
  }

  // 2. No numbering: blank-line blocks, joined across page breaks mid-sentence.
  const blocks: string[][] = [];
  for (const block of cleaned.split(/\n\s*\n/)) {
    const bl = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!bl.length) continue;
    const prev = blocks[blocks.length - 1];
    if (prev && !ENDS_SENTENCE.test(prev[prev.length - 1]) && /^[a-z]/.test(bl[0])) prev.push(...bl);
    else blocks.push(bl);
  }
  const texts = blocks
    .flatMap((b) => splitPageBlock(b))
    .map((g) => unwrapLines(g))
    .flatMap((t) => splitLong(t))
    .filter(hasWords);
  return { paras: texts.slice(0, MAX_PARAS).map((text, i) => ({ paraNo: i + 1, text })), mode: "blocks" };
}

/* ----------------------------- metadata guess ----------------------------- */

export type GuessedMeta = {
  court?: string;
  title?: string;
  decidedOn?: string; // ISO yyyy-mm-dd
  citation?: string;
  caseNo?: string;
  bench?: string;
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "the", "to", "with", "against"]);

/** "OF OFFENCES AGAINST THE STATE" → "Of Offences against the State". */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w) || !w) return w;
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.replace(/^(\(?)(\p{L})/u, (_, p: string, c: string) => p + c.toUpperCase());
    })
    .join("");
}

function iso(y: number, m: number, d: number) {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Best-effort metadata from the first page, for pre-filling the admin form. Always reviewed by a person. */
export function guessJudgmentMeta(text: string): GuessedMeta {
  const head = text.slice(0, 8000);
  const lines = head.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 80);
  const flat = lines.join("\n");
  const meta: GuessedMeta = {};

  const cites: string[] = [];
  const neutral = /\b((?:19|20)\d{2})\s*INSC\s*(\d{1,5})\b/.exec(flat);
  if (neutral) cites.push(`${neutral[1]} INSC ${neutral[2]}`);
  const hcNeutral = /\b(20\d{2}):([A-Z]{2,6}(?:-[A-Z]{2,5})?):(\d{1,6})(?:-DB)?\b/.exec(flat);
  if (hcNeutral) cites.push(hcNeutral[0]);
  // Reported citations only from the top of the first page, not from "cases cited".
  const top = lines.slice(0, 15).join("\n");
  const scr = /\[((?:19|20)\d{2})\]\s*(\d{1,2})\s*S\.\s?C\.\s?R\.?\s*(\d{1,4})/.exec(top);
  if (scr) cites.push(`[${scr[1]}] ${scr[2]} S.C.R. ${scr[3]}`);
  const scc = /\(((?:19|20)\d{2})\)\s*(\d{1,2})\s*SCC\s*(\d{1,4})/.exec(top);
  if (scc) cites.push(`(${scc[1]}) ${scc[2]} SCC ${scc[3]}`);
  if (cites.length) meta.citation = cites.join("; ");

  if (/SUPREME\s+COURT\s+OF\s+INDIA|S\.C\.R\.|\bINSC\b/i.test(flat)) meta.court = "Supreme Court of India";
  else {
    const hc = /HIGH\s+COURT\s+(?:OF\s+)?(?:JUDICATURE\s+(?:AT|FOR)\s+)?([A-Z][A-Z .&]+?)(?:\s+AT\s+[A-Z .]+)?(?:[,.\n]|$)/i.exec(flat);
    if (hc) meta.court = `${titleCase(hc[1].trim())} High Court`;
  }

  const named = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december),?\s+((?:19|20)\d{2})\b/i.exec(flat);
  if (named) meta.decidedOn = iso(Number(named[3]), MONTHS.indexOf(named[2].toLowerCase()) + 1, Number(named[1]));
  if (!meta.decidedOn) {
    const num = /\b(?:dated?|decided\s+on|date\s+of\s+(?:decision|judgment|order))\s*[:-]?\s*(\d{1,2})[./-](\d{1,2})[./-]((?:19|20)\d{2})/i.exec(flat);
    if (num) meta.decidedOn = iso(Number(num[3]), Number(num[2]), Number(num[1]));
  }

  const vIdx = lines.findIndex((l) => /^(?:v\.?|vs\.?|versus)$/i.test(l));
  if (vIdx > 0 && vIdx < lines.length - 1) {
    meta.title = `${lines[vIdx - 1]} v. ${lines[vIdx + 1]}`;
  } else {
    const inline = lines.find((l) => l.length < 200 && /\S\s+(?:v\.|vs\.?|versus)\s+\S/i.test(l));
    if (inline) meta.title = inline.replace(/\s+(?:v\.|vs\.?|versus)\s+/i, " v. ");
  }
  if (meta.title && meta.title.replace(" v. ", "") === meta.title.replace(" v. ", "").toUpperCase()) {
    meta.title = titleCase(meta.title).replace(/ V\. /, " v. ");
  }

  const caseNo = /\b((?:criminal|civil|writ|special\s+leave|transfer|review|curative|original|first|second)\s+(?:appeal|petition|case|application)s?\b[^\n()]{0,30}?No[s]?\.?\s*[\d/-]+(?:\s+of\s+(?:19|20)\d{2})?)/i.exec(flat);
  if (caseNo) meta.caseNo = caseNo[1].replace(/\s+/g, " ").trim();

  const bracketBench = /\[([^\]\n]{5,200}?),?\*?\s*(?:JJ|J|CJI)\.?\]/.exec(flat);
  const coram = /\bCORAM\s*:?\s*([^\n]{3,200})/i.exec(flat);
  if (bracketBench) meta.bench = bracketBench[1].replace(/\*/g, "").replace(/\s+and\s+/i, ", ").trim();
  else if (coram) meta.bench = coram[1].replace(/\s*,?\s*J\.?$/i, "").trim();

  return meta;
}
