// Pure helpers for India Code records (no network, no file system), shared by the
// ingest scripts and the app's India Code sync (src/lib/updates/india-code.ts).

export const INDIA_CODE = "https://indiacode.gov.in";

export function meta(item, key) {
  return item.metadata?.[key]?.[0]?.value ?? null;
}

export function handleUrl(handle) {
  return `${INDIA_CODE}/handle/${handle}`;
}

/* ------------------------------ HTML → text ------------------------------ */

const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
export const toSuperscript = (digits) => String(digits).replace(/\d/g, (d) => SUP[d]);

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Normalise typographic noise in India Code text (dash runs, doubled full stops, spaces). */
export function tidy(s) {
  return s
    .replace(/ /g, " ")
    .replace(/-{2,3}/g, "—")
    .replace(/\s+([,;:])/g, "$1")
    .replace(/([^.])\.\.(\s|$)/g, "$1.$2")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * India Code section HTML → paragraphs. Each paragraph ends with `<br/><hr/>`;
 * indentation is a run of empty `margin-left` spans; footnote markers are <sup>n</sup>.
 */
export function htmlToParagraphs(html) {
  if (!html) return [];
  const parts = html.split(/<br\s*\/?>\s*<hr[^>]*\/?>/i);
  const out = [];
  for (const part of parts) {
    const indent = (part.match(/<span style="margin-left:\s*15px;?"><\/span>/gi) ?? []).length;
    const text = tidy(
      decodeEntities(
        part
          .replace(/<sup>\s*(\d+)\s*<\/sup>/gi, (_, n) => toSuperscript(n))
          .replace(/<[^>]+>/g, " "),
      ),
    );
    if (text) out.push({ text, indent: Math.max(0, indent - 1) });
  }
  return out;
}

/** Footnote HTML (`<sup>1</sup>. Ins. by ...<br/><hr/>`) → ["Ins. by ...", ...] in order. */
export function htmlToFootnotes(html) {
  if (!html) return [];
  const notes = [];
  for (const part of html.split(/<br\s*\/?>\s*<hr[^>]*\/?>/i)) {
    const m = part.match(/^\s*<sup>\s*(\d+)\s*<\/sup>\s*\.?\s*([\s\S]*)$/i);
    const body = tidy(decodeEntities((m ? m[2] : part).replace(/<[^>]+>/g, " ")));
    if (!body) continue;
    if (m) notes.push({ n: Number(m[1]), text: body });
    else if (notes.length) notes[notes.length - 1].text += ` ${body}`;
    else notes.push({ n: notes.length + 1, text: body });
  }
  return notes;
}
