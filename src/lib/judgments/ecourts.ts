// Parses the per-judgment metadata JSON of the Indian Supreme Court / High Court
// judgments open datasets (Dattam Labs, CC BY 4.0). Each record holds the eCourts
// search-result HTML ("raw_html"); fields are read from it with narrow patterns.
// Pure functions, safe for tests.

import { titleCase } from "./text";

export type ParsedMeta = {
  title: string;
  court: string;
  decidedOn: string | null;
  citation: string | null;
  caseNo: string | null;
  bench: string | null;
  summary: string | null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d{1,6});/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<sup[\s\S]*?<\/sup>/gi, "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** "25-09-2024" → "2024-09-25". */
export function ddmmyyyy(s: string | undefined): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s?.trim() ?? "");
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Value of a "Label : value" pair in the eCourts case-details line. */
function detail(html: string, label: string): string | undefined {
  const re = new RegExp(`${label}\\s*:\\s*</span>\\s*<font[^>]*>([^<]*)</font>`, "i");
  return re.exec(html)?.[1]?.trim();
}

function caseTitle(s: string): string {
  const t = s.replace(/\s+(?:versus|vs\.?)\s+/i, " V. ").replace(/\s+/g, " ").trim();
  return (t === t.toUpperCase() ? titleCase(t) : t).replace(/ V\. /, " v. ");
}

function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Supreme Court record (metadata/json/year=YYYY/<path>.json). */
export function parseScMetadata(rec: { raw_html?: unknown; nc_display?: unknown }): ParsedMeta | null {
  const html = typeof rec.raw_html === "string" ? rec.raw_html : "";
  if (!html) return null;
  const aria = /aria-label="([^"]+?)\s+pdf"/i.exec(html)?.[1];
  const title = aria ? caseTitle(decodeEntities(aria)) : null;
  if (!title) return null;

  const cites: string[] = [];
  const nc = typeof rec.nc_display === "string" ? /^(\d{4})INSC(\d+)$/.exec(rec.nc_display) : null;
  if (nc) cites.push(`${nc[1]} INSC ${nc[2]}`);
  const scr = /class='escrText'>([^<]+)</.exec(html)?.[1]?.trim();
  if (scr) cites.push(decodeEntities(scr));

  const coram = /Coram\s*:\s*([\s\S]*?)<\/strong>/i.exec(html)?.[1];
  const bench = coram ? titleCase(stripTags(coram).replace(/\s*,\s*/g, ", ").replace(/\s+,/g, ",")) : null;
  const issue = /Issue for Consideration\s*([\s\S]*?)<br>/i.exec(html)?.[1];

  return {
    title,
    court: "Supreme Court of India",
    decidedOn: ddmmyyyy(detail(html, "Decision Date")),
    citation: cites.length ? cites.join("; ") : null,
    caseNo: detail(html, "Case No") ?? null,
    bench: bench || null,
    summary: issue ? clip(stripTags(issue), 600) || null : null,
  };
}

/** High Court record (metadata/json/year=YYYY/court=X_Y/bench=B/<file>.json). */
export function parseHcMetadata(rec: { raw_html?: unknown; court_name?: unknown }): ParsedMeta | null {
  const html = typeof rec.raw_html === "string" ? rec.raw_html : "";
  const court = typeof rec.court_name === "string" ? rec.court_name.trim() : "";
  if (!html || !court) return null;
  // "<font size='3'>ACB/1/2024 of THE STATE OF MAHARASHTRA Vs GANESH GHUGE</button>"
  const heading = /<font size='3'>([\s\S]*?)<\/(?:button|font)>/i.exec(html)?.[1];
  const text = heading ? stripTags(heading) : "";
  const m = /^(.*?)\s+of\s+(.+\s(?:Vs\.?|versus)\s.+)$/i.exec(text);
  const title = caseTitle(m ? m[2] : text);
  if (!title) return null;
  const judge = /<strong>\s*Judge\s*:\s*([\s\S]*?)<\/strong>/i.exec(html)?.[1];
  const cnr = detail(html, "CNR");
  return {
    title,
    court,
    decidedOn: ddmmyyyy(detail(html, "Decision Date")),
    citation: null,
    caseNo: m ? m[1].trim() : cnr ? `CNR ${cnr}` : null,
    bench: judge ? stripTags(judge).replace(/HON'BLE\s+(?:SHRI\s+|SMT\.?\s+|MR\.?\s+|MS\.?\s+|DR\.?\s+)?(?:JUSTICE\s+)?/gi, "").replace(/\s+/g, " ").trim() || null : null,
    summary: null,
  };
}
