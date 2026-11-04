// Turn a typeset India Code PDF into positioned text lines. Footnote markers
// (small raised digits) become Unicode superscripts, the "IndiaCode" watermark
// and page numbers are dropped, and each page's footnote block is split off.
import { getDocumentProxy } from "unpdf";
import { toSuperscript } from "./indiacode-text.mjs";

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function modeRounded(xs) {
  const counts = new Map();
  for (const x of xs) {
    const k = Math.round(x);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = 0;
  let bestN = -1;
  for (const [k, n] of counts) if (n > bestN || (n === bestN && k < best)) [best, bestN] = [k, n];
  return best;
}

/** Dominant font size by character count. */
function dominantSize(items) {
  const w = new Map();
  for (const it of items) {
    const k = Math.round(it.sz * 2) / 2;
    w.set(k, (w.get(k) ?? 0) + it.s.trim().length);
  }
  let best = 0;
  let bestN = -1;
  for (const [k, n] of w) if (n > bestN) [best, bestN] = [k, n];
  return best;
}

function buildLineText(items) {
  items.sort((a, b) => a.x - b.x);
  let text = "";
  let prevEnd = null;
  for (const it of items) {
    // Hair-width "spaces" are kerning inside small capitals ("B ILLS"), not word breaks.
    if (!it.sup && it.s.trim() === "" && it.w < 1.3) {
      prevEnd = it.x + it.w;
      continue;
    }
    const s = it.sup ? toSuperscript(it.s.trim()) : it.s;
    if (prevEnd !== null && it.x - prevEnd > 1.2 && !/\s$/.test(text) && !/^\s/.test(s) && !it.sup) text += " ";
    text += s;
    prevEnd = it.x + it.w;
  }
  return text
    .replace(/\s+/g, " ")
    // Some India Code PDFs encode curly quotes as U+2015 / U+2016.
    .replace(/―(?=[\p{L}\p{N}(‘'])/gu, "“")
    .replace(/‖/g, "”")
    .replace(/―/g, "—")
    .replace(/(\p{L})‘(?=\p{L})/gu, "$1’")
    .trim();
}

/**
 * @returns {Promise<{pages: {page:number, width:number, bodySize:number, left:number, right:number,
 *   lines: {text:string,x0:number,x1:number,y:number,size:number,page:number}[],
 *   footnotes: Map<number,string>}[]}>}
 */
export async function pdfToPages(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  // Pass 1: raw items per page, so the body font size can be taken across the document
  // (a page dense with footnotes would otherwise look like 9 pt body text).
  const rawPages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const { items } = await page.getTextContent();
    const raw = [];
    for (const it of items) {
      if (!("str" in it) || it.str === "" || (it.str.trim() === "" && it.width < 0.5)) continue;
      const sz = Math.hypot(it.transform[0], it.transform[1]);
      // Watermark text is set in a very large font.
      if (sz >= 20) continue;
      raw.push({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, sz });
    }
    rawPages.push({ p, vp, raw });
  }
  const docBody = median(rawPages.filter((r) => r.raw.length > 20).map((r) => dominantSize(r.raw)));
  const pages = [];
  for (const { p, vp, raw } of rawPages) {
    if (raw.length === 0) {
      pages.push({ page: p, width: vp.width, bodySize: docBody, left: 0, right: 0, lines: [], footnotes: new Map() });
      continue;
    }
    // Footnote-heavy pages look like small body text; never go below the document's body size.
    const bodySize = Math.max(dominantSize(raw), docBody);
    const isSupCandidate = (it) => it.sz < bodySize * 0.8 && /^\s*\d{1,3}\s*$/.test(it.s);
    const normal = raw.filter((it) => !isSupCandidate(it));
    const sups = raw.filter(isSupCandidate);

    // Group normal items into lines by baseline.
    normal.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of normal) {
      const line = lines.find((l) => Math.abs(l.y - it.y) <= 2.5);
      if (line) line.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }
    // Attach superscripts to the line whose baseline sits just below them.
    for (const s of sups) {
      let best = null;
      for (const l of lines) {
        const dy = s.y - l.y;
        if (dy > 1 && dy < 8.5) {
          const near = l.items.some((i) => s.x >= i.x - 40 && s.x <= i.x + i.w + 40);
          if (near && (!best || dy < s.y - best.y)) best = l;
        }
      }
      if (best) best.items.push({ ...s, sup: true });
      else {
        const same = lines.find((l) => Math.abs(l.y - s.y) <= 2.5);
        if (same) same.items.push(s);
        else lines.push({ y: s.y, items: [s] });
      }
    }
    lines.sort((a, b) => b.y - a.y);

    let built = lines
      .map((l) => {
        const nonSup = l.items.filter((i) => !i.sup);
        const xs = l.items.map((i) => i.x);
        const ends = l.items.map((i) => i.x + i.w);
        return {
          text: buildLineText(l.items),
          x0: Math.min(...xs),
          x1: Math.max(...ends),
          y: l.y,
          size: dominantSize(nonSup.length ? nonSup : l.items),
          page: p,
        };
      })
      .filter((l) => l.text !== "");

    // Page numbers (a bare number in the top or bottom margin).
    built = built.filter((l) => !(/^\d{1,4}$/.test(l.text) && (l.y < 80 || l.y > vp.height - 60)));

    // Margins from full-width lines (every full line starts at the left margin).
    const long = built.filter((l) => l.x1 - l.x0 > 250);
    const left = modeRounded((long.length ? long : built).map((l) => l.x0));
    const right = long.length ? Math.max(...long.map((l) => Math.round(l.x1))) : vp.width - left;

    // Footnote block: the first "1." line at the left margin, set smaller than the text
    // above it, after which every line on the page is equally small.
    const footnotes = new Map();
    let cut = built.length;
    for (let i = 1; i < built.length; i++) {
      const l = built[i];
      // Some pages print the first marker without its full stop ("1 Subs. by …").
      if (!/^1(\.\s|\s+[A-Z])/.test(l.text) || l.x0 > left + 12) continue;
      // Largest text size used by at least two lines above (illustrations are small too,
      // so the most common size is not enough).
      const counts = new Map();
      for (const b of built.slice(0, i)) counts.set(b.size, (counts.get(b.size) ?? 0) + 1);
      const above = Math.max(0, ...[...counts].filter(([, n]) => n >= 2).map(([sz]) => sz));
      if (l.size > above - 0.75 || l.size > docBody - 0.75) continue;
      const ceiling = Math.min(above, docBody) - 0.75;
      if (built.slice(i).every((r) => r.size <= ceiling)) {
        cut = i;
        break;
      }
    }
    if (cut < built.length) {
      let expected = 1;
      let current = null;
      for (const l of built.slice(cut)) {
        const m = l.text.match(/^(\d{1,3})(?:\.\s+|\s+(?=[A-Z]))(.*)$/);
        if (m && Number(m[1]) === expected) {
          current = Number(m[1]);
          footnotes.set(current, m[2]);
          expected++;
        } else if (current !== null) {
          const prev = footnotes.get(current);
          footnotes.set(current, prev.endsWith("-") && /[a-z]$/i.test(prev.slice(0, -1)) ? prev + l.text : `${prev} ${l.text}`);
        }
      }
      built = built.slice(0, cut);
    }

    pages.push({ page: p, width: vp.width, bodySize, left, right, lines: built, footnotes });
  }
  return { pages, numPages: pdf.numPages, bodySize: docBody };
}
