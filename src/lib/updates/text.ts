// Small, dependency-free text helpers for feed parsing. Pure functions.

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  hellip: "…",
  bull: "•",
  middot: "·",
  rupee: "₹",
  copy: "©",
  reg: "®",
  trade: "™",
  sect: "§",
  para: "¶",
  deg: "°",
  times: "×",
  laquo: "«",
  raquo: "»",
  prime: "′",
  Prime: "″",
  zwj: "",
  zwnj: "",
  shy: "",
};

// Numeric references 128–159 are Windows-1252 in practice (WordPress emits &#151; for "—").
const CP1252: Record<number, string> = {
  128: "€", 130: "‚", 132: "„", 133: "…", 134: "†", 135: "‡", 137: "‰", 139: "‹",
  145: "‘", 146: "’", 147: "“", 148: "”", 149: "•", 150: "–", 151: "—", 153: "™", 155: "›",
};

function fromCodePoint(n: number): string {
  // Invalid or control code points become nothing rather than throwing.
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "";
  if (n >= 128 && n <= 159) return CP1252[n] ?? "";
  if (n < 32 && n !== 9 && n !== 10 && n !== 13) return "";
  return String.fromCodePoint(n);
}

/** Decodes XML/HTML character references (named, decimal and hex). Unknown names are kept. */
export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, ref: string) => {
    if (ref[0] === "#") {
      return ref[1] === "x" || ref[1] === "X" ? fromCodePoint(Number.parseInt(ref.slice(2), 16)) : fromCodePoint(Number(ref.slice(1)));
    }
    return NAMED[ref] ?? NAMED[ref.toLowerCase()] ?? m;
  });
}

/** Collapses all whitespace (including non-breaking spaces) to single spaces. */
export function squash(s: string): string {
  return s.replace(/[\s\u00a0\u2000-\u200b\u2028\u2029\u202f\u205f\u3000]+/g, " ").trim();
}

/** HTML fragment → plain text: drops scripts, styles and tags, decodes entities. */
export function htmlToText(html: string): string {
  const noBlocks = html
    .replace(/<(script|style|noscript|iframe|figure|figcaption)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  // Feeds often double-escape (&amp;nbsp;), so decode twice, then strip any tags that appear.
  return squash(decodeEntities(decodeEntities(noBlocks)).replace(/<[^>]*>/g, " "));
}

/** First paragraph of an HTML body (used when a feed has no description). */
export function firstParagraph(html: string): string {
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = htmlToText(m[1]);
    if (t.length >= 40) return t;
  }
  return htmlToText(html);
}

/** Clips text to `max` characters (ellipsis included), on a word boundary when possible. */
export function clip(s: string, max = 200): string {
  const t = squash(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with", "under", "vs", "v"]);
const ROMAN = /^[ivxlcdm]+$/i;

/** "THE TRIBUNALS REFORMS BILL, 2026" → "The Tribunals Reforms Bill, 2026". Leaves mixed-case text alone. */
export function titleCaseIfShouting(s: string): string {
  const letters = s.replace(/[^a-z]/gi, "");
  if (!letters || letters !== letters.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/(\s+|-|\()/)
    .map((w, i) => {
      if (!w.trim() || w === "-" || w === "(") return w;
      const core = w.replace(/[^a-z]/gi, "");
      if (core.length > 1 && ROMAN.test(core) && core.length <= 5 && !["mix", "dim", "mid", "lid", "did", "civil", "ill", "mill"].includes(core)) {
        return w.toUpperCase();
      }
      if (i > 0 && SMALL.has(core)) return w;
      return w.replace(/^([^a-z]*)([a-z])/, (_m, p: string, c: string) => p + c.toUpperCase());
    })
    .join("");
}

/** Normalises a link for de-duplication: https only, no tracking parameters or fragments. */
export function normalizeUrl(raw: string, base?: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim(), base);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  for (const k of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_|ref$|amp$)/i.test(k)) u.searchParams.delete(k);
  }
  u.hash = "";
  return u.toString();
}

/** A stable key for "the same headline" across sources: lower-case letters and digits. */
export function titleKey(title: string): string {
  return squash(title)
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
