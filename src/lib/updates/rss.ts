// A small, tolerant RSS 2.0 / RSS 1.0 (RDF) / Atom parser. No dependencies and no
// DOM: feeds are matched with bounded regular expressions after CDATA sections are
// set aside, so markup inside CDATA can never break item boundaries. Pure functions.
import { clip, decodeEntities, firstParagraph, htmlToText, squash } from "./text";

export type FeedItem = {
  title: string;
  link: string | null;
  /** Plain-text description, at most 200 characters. */
  summary: string | null;
  published: Date | null;
  categories: string[];
  guid: string | null;
};

export type ParsedFeed = { format: "rss" | "atom" | "rdf"; title: string | null; items: FeedItem[] };

const MAX_ITEMS = 100;
const MAX_FIELD = 50_000;

type Ctx = { cdata: string[] };

const PH = "\u0000";

function protect(xml: string): { text: string; ctx: Ctx } {
  const cdata: string[] = [];
  const text = xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, c: string) => {
      cdata.push(c);
      return `${PH}${cdata.length - 1}${PH}`;
    });
  return { text, ctx: { cdata } };
}

/** Element text: XML entities decoded outside CDATA, CDATA kept verbatim. */
function value(raw: string, ctx: Ctx): string {
  const parts = raw.split(PH);
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    out += i % 2 === 1 ? (ctx.cdata[Number(parts[i])] ?? "") : decodeEntities(parts[i]);
  }
  return out.length > MAX_FIELD ? out.slice(0, MAX_FIELD) : out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Inner text of the first element named `name` (namespace prefix exact, e.g. "content:encoded"). */
function tag(block: string, name: string, ctx: Ctx): string | null {
  const re = new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}\\s*>`, "i");
  const m = block.match(re);
  return m ? value(m[1], ctx) : null;
}

function tags(block: string, name: string, ctx: Ctx): string[] {
  const re = new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}\\s*>`, "gi");
  return [...block.matchAll(re)].map((m) => value(m[1], ctx));
}

function attr(openTag: string, name: string): string | null {
  const m = openTag.match(new RegExp(`\\s${esc(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : null;
}

function blocks(text: string, name: string): string[] {
  const re = new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}\\s*>`, "gi");
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    out.push(m[1]);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

const TZ: Record<string, string> = { IST: "+0530", UT: "+0000", UTC: "+0000", GMT: "+0000", EST: "-0500", EDT: "-0400", PST: "-0800", PDT: "-0700" };

/** RFC 822 (RSS), ISO 8601 (Atom, dc:date) and a few real-world variants; null when unreadable. */
export function parseFeedDate(raw: string | null | undefined, now = new Date()): Date | null {
  if (!raw) return null;
  let s = squash(raw);
  if (!s) return null;
  s = s.replace(/\b(IST|UTC|UT|GMT|EST|EDT|PST|PDT)$/i, (z) => TZ[z.toUpperCase()] ?? z);
  // "2026-08-10 00:00:00.0" (no zone): treat as Indian time.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = `${s.replace(" ", "T").replace(/\.\d+$/, "")}+05:30`;
  // "17/08/2026" (day first, as Indian government sites write it)
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) s = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}T00:00:00+05:30`;
  let t = Date.parse(s);
  if (Number.isNaN(t)) {
    // "Tue, 3 Nov 2026 9:05:00 +0530" without seconds etc.: drop the weekday and retry.
    t = Date.parse(s.replace(/^[A-Za-z]{3,9},?\s*/, ""));
  }
  if (Number.isNaN(t)) return null;
  // Far-future dates are feed errors; a day of clock skew is tolerated.
  if (t > now.getTime() + 2 * 86_400_000) return null;
  if (t < Date.UTC(1950, 0, 1)) return null;
  return new Date(t);
}

/** "… on 2 November, 2026" at the end of a title (Indian Kanoon), as a date in IST. */
export function dateFromTitle(title: string): Date | null {
  const m = title.match(/\bon\s+(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})\s*$/);
  if (!m) return null;
  const t = Date.parse(`${m[1]} ${m[2]} ${m[3]} 00:00:00 +0530`);
  return Number.isNaN(t) ? null : new Date(t);
}

const WP_FOOTER = /\s*The post .{1,400}? appeared first on .{1,200}?\.?\s*$/i;

function summaryOf(description: string | null, content: string | null): string | null {
  const d = description ? htmlToText(description).replace(WP_FOOTER, "").replace(/\s*(\[(…|\.\.\.)\]|Continue reading.*)$/i, "") : "";
  const text = d.length >= 20 ? d : content ? firstParagraph(content).replace(WP_FOOTER, "") : d;
  const out = clip(text, 200);
  return out ? out : null;
}

function rssItem(block: string, ctx: Ctx, now: Date): FeedItem {
  const title = htmlToText(tag(block, "title", ctx) ?? "");
  const linkText = squash(tag(block, "link", ctx) ?? "");
  const guidMatch = block.match(/<guid(\s[^>]*)?>([\s\S]*?)<\/guid>/i);
  const guid = guidMatch ? squash(value(guidMatch[2], ctx)) : null;
  const guidIsLink = guid && /^https?:\/\//i.test(guid) && !/ispermalink\s*=\s*["']false/i.test(guidMatch?.[1] ?? "");
  // Some feeds put an Atom <link href> inside RSS items.
  const atomLink = block.match(/<(?:atom:)?link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1] ?? null;
  const link = linkText || (guidIsLink ? guid : null) || (atomLink ? decodeEntities(atomLink) : null);
  const published =
    parseFeedDate(tag(block, "pubDate", ctx), now) ??
    parseFeedDate(tag(block, "dc:date", ctx), now) ??
    parseFeedDate(tag(block, "atom:updated", ctx), now) ??
    parseFeedDate(tag(block, "atom:published", ctx), now);
  return {
    title,
    link: link || null,
    summary: summaryOf(tag(block, "description", ctx), tag(block, "content:encoded", ctx)),
    published,
    categories: [...tags(block, "category", ctx), ...tags(block, "dc:subject", ctx)].map((c) => htmlToText(c)).filter(Boolean),
    guid,
  };
}

function atomLink(block: string): string | null {
  let fallback: string | null = null;
  for (const m of block.matchAll(/<link\b[^>]*>/gi)) {
    const open = m[0];
    const href = attr(open, "href");
    if (!href) continue;
    const rel = (attr(open, "rel") ?? "alternate").toLowerCase();
    if (rel === "alternate") {
      const type = attr(open, "type");
      if (!type || /html/i.test(type)) return href;
      fallback ??= href;
    }
  }
  return fallback;
}

function atomEntry(block: string, ctx: Ctx, now: Date): FeedItem {
  const content = tag(block, "content", ctx);
  return {
    title: htmlToText(tag(block, "title", ctx) ?? ""),
    link: atomLink(block),
    summary: summaryOf(tag(block, "summary", ctx), content),
    published: parseFeedDate(tag(block, "published", ctx), now) ?? parseFeedDate(tag(block, "updated", ctx), now),
    categories: [...block.matchAll(/<category\b[^>]*>/gi)].map((m) => attr(m[0], "term") ?? attr(m[0], "label") ?? "").map(squash).filter(Boolean),
    guid: squash(tag(block, "id", ctx) ?? "") || null,
  };
}

/** Parses an RSS 2.0, RSS 1.0 or Atom document. Throws only when the text is not a feed at all. */
export function parseFeed(xml: string, now = new Date()): ParsedFeed {
  const { text, ctx } = protect(xml.replace(/^\uFEFF/, ""));
  const head = text.slice(0, 4000);
  if (/<feed\b/i.test(head) && !/<rss\b/i.test(head)) {
    const header = text.split(/<entry\b/i)[0];
    const items = blocks(text, "entry").map((b) => atomEntry(b, ctx, now));
    return { format: "atom", title: htmlToText(tag(header, "title", ctx) ?? "") || null, items };
  }
  if (/<rss\b/i.test(head) || /<rdf:RDF\b/i.test(head) || /<channel\b/i.test(head)) {
    const header = text.split(/<item\b/i)[0];
    const channelTitle = tag(header, "title", ctx);
    const items = blocks(text, "item").map((b) => rssItem(b, ctx, now));
    return { format: /<rdf:RDF\b/i.test(head) ? "rdf" : "rss", title: channelTitle ? htmlToText(channelTitle) : null, items };
  }
  throw new Error("Not an RSS or Atom feed");
}
