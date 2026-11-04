// Token estimates and sentence-boundary trimming. Pure: no server dependencies.

/**
 * Rough token count without a tokenizer: about 4 characters per token for
 * Latin text and about 1.5 per token for Devanagari and other scripts, which
 * tokenize much less densely. Errs high, which is the safe side for a budget.
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 128) ascii++;
    // Count a surrogate pair once.
    else if (c < 0xdc00 || c > 0xdfff) other++;
  }
  return Math.ceil(ascii / 4 + other / 1.5);
}

/** Marks where text was cut; "[…]" is the usual elision mark in legal quotation. */
export const TRIM_MARK = " […]";

// Words that end with a full stop without ending a sentence in Indian legal text.
const ABBREVIATIONS = new Set([
  "s", "ss", "sec", "secs", "no", "nos", "art", "arts", "cl", "cls", "r", "rr", "o", "ord", "v", "vs", "viz", "etc",
  "cf", "ie", "eg", "ltd", "pvt", "co", "corp", "inc", "mr", "mrs", "ms", "dr", "sh", "shri", "smt", "kum", "st",
  "govt", "dept", "para", "paras", "p", "pp", "pg", "vol", "ch", "sch", "ibid", "supra", "infra", "cr", "crl", "civ",
  "misc", "jt", "sc", "scc", "air", "anr", "ors", "cri", "lj", "j", "jj", "cj", "hon'ble", "honble", "ed", "approx",
  "w.e.f", "i.e", "e.g", "u/s", "cr.p.c", "crpc", "ipc", "dt", "dtd", "addl", "asst", "spl", "hc", "hon",
]);

/** Indices just after each sentence end in `text` (after the punctuation and any closing quote). */
function sentenceEnds(text: string): number[] {
  const out: number[] = [];
  // Paragraph and line breaks always end a unit.
  for (const m of text.matchAll(/\n+/g)) out.push(m.index);
  // ., ?, ! and the Devanagari danda / double danda, optionally followed by closing quotes or brackets.
  for (const m of text.matchAll(/[.?!।॥]["'’”)\]]*(?=\s|$)/g)) {
    const end = m.index + m[0].length;
    if (m[0][0] === ".") {
      const word = /([^\s(]+)\.$/.exec(text.slice(Math.max(0, m.index - 12), m.index + 1))?.[1]?.toLowerCase() ?? "";
      const bare = word.replace(/^["'‘“(\[]+/, "");
      if (ABBREVIATIONS.has(bare) || /^[a-z]$/i.test(bare)) continue;
      // A lower-case word next means the sentence goes on ("s. 2 of the Act. and ...").
      const next = /^\s*(\S)/.exec(text.slice(end))?.[1];
      if (next && /[a-z]/.test(next)) continue;
    }
    out.push(end);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Shortens text to at most `maxChars` (plus the trim mark), cutting at the last
 * sentence end that keeps at least 40% of the allowance, else at a word break.
 */
export function trimAtSentence(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  if (maxChars <= 0) return "";
  const floor = Math.floor(maxChars * 0.4);
  const ends = sentenceEnds(t.slice(0, maxChars + 1)).filter((i) => i <= maxChars && i >= floor);
  let cut = ends.length ? ends[ends.length - 1] : -1;
  if (cut < 0) {
    const space = t.lastIndexOf(" ", maxChars);
    cut = space >= Math.floor(maxChars * 0.6) ? space : maxChars;
  }
  return `${t.slice(0, cut).trimEnd()}${TRIM_MARK}`;
}

/** Trims text at a sentence boundary so its estimate fits `maxTokens`. */
export function trimToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  const total = estimateTokens(text);
  if (total <= maxTokens) return text;
  const markTokens = estimateTokens(TRIM_MARK);
  let chars = Math.floor(text.length * ((maxTokens - markTokens) / total));
  for (let i = 0; i < 8 && chars > 0; i++) {
    const out = trimAtSentence(text, chars);
    if (estimateTokens(out) <= maxTokens) return out;
    chars = Math.floor(chars * 0.85);
  }
  return "";
}
