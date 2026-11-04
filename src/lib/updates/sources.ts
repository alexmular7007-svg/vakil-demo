// Where legal updates come from. Add a feed by adding one entry to SOURCES (or, without
// a code change, a URL in EXTRA_UPDATE_FEEDS). Switch any source off without a code
// change by listing its key in DISABLED_UPDATE_SOURCES (e.g. "prs-billtrack,india_code").
// Every source was fetched and checked before being listed; the note on each records
// its format and terms.
//
// Checked and NOT used (November 2026):
//  - LiveLaw (livelaw.in/rss): the RSS page sits behind login/pricing; no public feed.
//  - PIB (pib.gov.in RssMain.aspx, incl. Ministry of Law and Justice): every pib.gov.in
//    page answers 403 "Access Denied" (Akamai) to automated clients; add it through
//    EXTRA_UPDATE_FEEDS if it works from your server.
//  - Supreme Court of India (sci.gov.in) and Legislative Department (legislative.gov.in):
//    403 to automated clients, no feed. Supreme Court judgments come via Indian Kanoon.
//  - e-Gazette (egazette.gov.in): no feed; session-based search pages only.
//  - Supreme Court Observer (scobserver.in/feed): feed has not been updated since 2022.
//  - Lok Sabha bills API: the Rajya Sabha endpoint below already lists Government
//    bills of both Houses, so one request covers Parliament.
// India Code (acts, amendments to tracked acts) is handled separately in india-code.ts.
import { dateFromTitle, parseFeed } from "./rss";
import { clip, decodeEntities, normalizeUrl, squash, titleCaseIfShouting } from "./text";
import type { RawEntry, UpdateKind } from "./types";

export type ParserId = "rss" | "prs-billtrack" | "sansad-bills";

export type SourceDef = {
  /** Stable id stored on every item (legal_updates.source_key). */
  key: string;
  /** Shown to users as the attribution. */
  name: string;
  /** What is fetched (one request per run). */
  url: string;
  /** A page people can open to see the source themselves. */
  homepage: string;
  /** Kind used when an entry's wording does not say otherwise. */
  kind: UpdateKind;
  parser: ParserId;
  enabled: boolean;
  /** Format and terms, for admins. */
  note: string;
  /** Labels added to every entry (help the classifier, e.g. "Supreme Court"). */
  categories?: string[];
  /** Read "… on 2 November, 2026" from titles when items carry no date. */
  dateFromTitle?: boolean;
  /** At most this many entries per run (newest first). */
  limit?: number;
  /** Per-request time limit (default SOURCE_DEFAULTS.timeoutMs). */
  timeoutMs?: number;
  /** Extra attempts after a transient failure (default SOURCE_DEFAULTS.retries). */
  retries?: number;
  /** Why the source is off when `enabled` is false: in this file ("code") or DISABLED_UPDATE_SOURCES ("env"). */
  disabledBy?: "code" | "env";
};

/** Fetch limits per source. A source's worst case is about budgetMs, so the cron run stays well inside its 300 s. */
export const SOURCE_DEFAULTS = { timeoutMs: 20_000, retries: 2, baseDelayMs: 1500, maxDelayMs: 8000, budgetMs: 55_000, minAttemptMs: 5000 } as const;

export const INDIA_CODE_SOURCE = {
  key: "india_code",
  name: "India Code",
  homepage: "https://indiacode.gov.in/",
  note: "Official repository of central and state Acts (Legislative Department, Ministry of Law and Justice). DSpace REST API: the ACT record and PDF checksums of every tracked act are compared each run; section text is re-read when they change (and for one act per run in rotation). New central Acts of the year are listed, never auto-imported.",
} as const;

export const SOURCES: SourceDef[] = [
  {
    key: "sansad-bills",
    name: "Parliament of India (Sansad)",
    url: "https://sansad.in/api_rs/legislation/getBills?page=1&size=25&locale=en&billType=Government&sortOn=billIntroducedDate&sortBy=desc",
    homepage: "https://sansad.in/rs/legislation/bills",
    kind: "bill",
    parser: "sansad-bills",
    enabled: true,
    note: "JSON behind sansad.in's bills page (Rajya Sabha Secretariat): Government bills of both Houses with dates, status and links to the official bill PDFs. Public government record; undocumented endpoint, so the parser fails safely if it changes.",
  },
  {
    key: "prs-billtrack",
    name: "PRS Legislative Research",
    url: "https://prsindia.org/billtrack/category/all",
    homepage: "https://prsindia.org/billtrack",
    kind: "bill",
    parser: "prs-billtrack",
    enabled: true,
    limit: 30,
    note: "HTML Bill Track listing, newest first (bill or rules title and status). No RSS. robots.txt allows /billtrack (crawl-delay 10); fetched once per run. Only the title, status and link are kept, with attribution.",
  },
  {
    key: "indiankanoon-sc",
    name: "Supreme Court of India (via Indian Kanoon)",
    url: "https://indiankanoon.org/feeds/latest/supremecourt/",
    homepage: "https://indiankanoon.org/browse/supremecourt/",
    kind: "judgment",
    parser: "rss",
    enabled: true,
    categories: ["Supreme Court"],
    dateFromTitle: true,
    note: "RSS 2.0 of new Supreme Court judgments from Indian Kanoon's public feeds page (indiankanoon.org/feeds). Items have no pubDate, so the decision date is read from the title. Judgments are public documents; title, link and a 200-character excerpt are kept.",
  },
  {
    key: "scc-times",
    name: "SCC Times",
    url: "https://www.scconline.com/blog/feed/",
    homepage: "https://www.scconline.com/blog/",
    kind: "news",
    parser: "rss",
    enabled: true,
    note: "WordPress RSS 2.0 (Atom at /blog/feed/atom/) of the SCC Online blog. Headline, link and the feed's own excerpt (at most 200 characters) only, never the article.",
  },
  {
    key: "barandbench",
    name: "Bar & Bench",
    url: "https://www.barandbench.com/stories.rss",
    homepage: "https://www.barandbench.com/",
    kind: "news",
    parser: "rss",
    enabled: false,
    note: "RSS 2.0 works (barandbench.com/feed redirects here), but its terms of use limit site content to personal, non-commercial use. Off until the publisher gives written permission.",
  },
];

/** EXTRA_UPDATE_FEEDS (comma or newline separated https URLs) → RSS/Atom sources. */
export function extraFeedSources(raw: string | undefined | null): SourceDef[] {
  if (!raw) return [];
  const out: SourceDef[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,\n]/)) {
    const url = normalizeUrl(part.trim());
    if (!url || !url.startsWith("https://") || seen.has(url)) continue;
    seen.add(url);
    const host = new URL(url).hostname.replace(/^www\./, "");
    out.push({
      key: `extra:${host}:${out.length + 1}`.slice(0, 80),
      name: host,
      url,
      homepage: `https://${new URL(url).hostname}/`,
      kind: "news",
      parser: "rss",
      enabled: true,
      note: "Added through EXTRA_UPDATE_FEEDS.",
    });
  }
  return out;
}

/** DISABLED_UPDATE_SOURCES → keys (lower case). A trailing "*" matches a prefix, e.g. "extra:*". */
export function parseDisabledSources(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[,\n\s]+/).map((k) => k.trim().toLowerCase()).filter((k) => /^[a-z0-9_:.*-]{1,100}$/.test(k)))];
}

export function isSourceDisabled(key: string, disabled: readonly string[]): boolean {
  const k = key.toLowerCase();
  return disabled.some((d) => (d.endsWith("*") ? k.startsWith(d.slice(0, -1)) : d === k));
}

/**
 * Applies DISABLED_UPDATE_SOURCES to a source list. It can only switch sources off:
 * a source disabled in code (e.g. for its terms of use) stays off whatever the env says.
 */
export function applyDisabledSources(sources: readonly SourceDef[], disabled: readonly string[]): SourceDef[] {
  return sources.map((s) => {
    if (!s.enabled) return { ...s, disabledBy: s.disabledBy ?? "code" };
    if (isSourceDisabled(s.key, disabled)) return { ...s, enabled: false, disabledBy: "env" };
    return s;
  });
}

/* --------------------------------- parsers --------------------------------- */

const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(d);

/** Any RSS 2.0 / RSS 1.0 / Atom feed. */
export function parseRssEntries(body: string, source: Pick<SourceDef, "url" | "categories" | "dateFromTitle" | "limit">, now = new Date()): RawEntry[] {
  const feed = parseFeed(body, now);
  const out: RawEntry[] = [];
  for (const it of feed.items) {
    const url = it.link ? normalizeUrl(it.link, source.url) : null;
    if (!url || !it.title) continue;
    out.push({
      title: clip(it.title, 300),
      url,
      summary: it.summary,
      publishedAt: it.published ?? (source.dateFromTitle ? dateFromTitle(it.title) : null),
      categories: [...it.categories.slice(0, 12), ...(source.categories ?? [])],
    });
    if (out.length >= (source.limit ?? 50)) break;
  }
  return out;
}

/** PRS Bill Track listing: `<div class="views-row">` with a title link and a status span. */
export function parsePrsBillTrack(html: string, base = "https://prsindia.org/billtrack/category/all", limit = 30): RawEntry[] {
  const out: RawEntry[] = [];
  const seen = new Set<string>();
  const rows = html.split(/<div\s+class="views-row">/i).slice(1);
  if (!rows.length) throw new Error("PRS listing: no rows found (page layout changed?)");
  for (const row of rows) {
    const a = row.match(/<h3[^>]*>\s*<a\s+[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const url = normalizeUrl(decodeEntities(a[1]), base);
    const title = squash(decodeEntities(a[2].replace(/<[^>]*>/g, " ")));
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const status = squash(decodeEntities(row.match(/class="status-[^"]*"\s*>([^<]+)</i)?.[1] ?? ""));
    const isRules = /^rules$/i.test(status) || /\b(rules|regulations)\b,?\s*\d{4}/i.test(title);
    out.push({
      title,
      url,
      summary: status ? clip(`${isRules ? "Rules" : "Bill"} tracked by PRS Legislative Research. Status: ${status}.`, 200) : null,
      publishedAt: null,
      categories: status ? [status] : [],
      kind: isRules ? "notification" : /^draft\b/i.test(title) ? "bill" : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

type SansadBill = {
  billNumber?: string | null;
  billName?: string | null;
  billType?: string | null;
  billCategory?: string | null;
  ministryName?: string | null;
  billIntroducedInHouse?: string | null;
  billIntroducedDate?: string | null;
  billIntroducedFile?: string | null;
  billPassedInBothHousesFile?: string | null;
  billGazettedFile?: string | null;
  billAssentedDate?: string | null;
  actNo?: string | null;
  actYear?: number | string | null;
  status?: string | null;
};

function sansadDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00+05:30`);
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}T00:00:00+05:30`);
  return null;
}

/** sansad.in getBills JSON: one entry per bill introduced, one more when it becomes an Act. */
export function parseSansadBills(body: string, now = new Date()): RawEntry[] {
  const data = JSON.parse(body) as { records?: SansadBill[] };
  if (!Array.isArray(data.records)) throw new Error("Sansad bills: unexpected response (no records)");
  const out: RawEntry[] = [];
  const seen = new Set<string>();
  const push = (e: RawEntry) => {
    if (seen.has(e.url)) return;
    seen.add(e.url);
    out.push(e);
  };
  for (const r of data.records) {
    const name = squash(r.billName ?? "").replace(/\.$/, "");
    if (!name) continue;
    const title = titleCaseIfShouting(name);
    const house = squash(r.billIntroducedInHouse ?? "");
    const status = squash(r.status ?? "");
    const cats = [r.billCategory, r.ministryName, status, house].map((c) => squash(c ?? "")).filter(Boolean);
    const introduced = sansadDate(r.billIntroducedDate);
    const introUrl = r.billIntroducedFile ? normalizeUrl(r.billIntroducedFile) : null;
    if (introUrl) {
      const parts = [
        `${r.billType === "Government" ? "Government bill" : "Bill"} introduced in ${house || "Parliament"}${introduced ? ` on ${fmtDate(introduced)}` : ""}`,
        r.billNumber?.trim() ? `(Bill No. ${r.billNumber.trim()})` : "",
      ].filter(Boolean);
      push({
        title,
        url: introUrl,
        summary: clip(`${parts.join(" ")}.${status ? ` Status: ${status}.` : ""}`, 200),
        publishedAt: introduced && introduced <= now ? introduced : null,
        categories: cats,
        kind: "bill",
      });
    }
    const assented = sansadDate(r.billAssentedDate);
    const actUrl = normalizeUrl(r.billGazettedFile || r.billPassedInBothHousesFile || "") ?? null;
    if (assented && actUrl && /assent/i.test(status)) {
      const actTitle = title.replace(/\bBill\b/, "Act");
      const actNo = squash(String(r.actNo ?? ""));
      push({
        title: actTitle,
        url: actUrl,
        summary: clip(`Passed by Parliament; received the President's assent on ${fmtDate(assented)}${actNo ? ` as Act No. ${actNo} of ${r.actYear ?? assented.getFullYear()}` : ""}.`, 200),
        publishedAt: assented <= now ? assented : null,
        categories: cats,
        kind: /\(amendment\)|\bamendment\b/i.test(actTitle) ? "amendment" : "act",
      });
    }
  }
  return out;
}

/** Runs a source's parser on a fetched body. */
export function parseSource(source: SourceDef, body: string, now = new Date()): RawEntry[] {
  switch (source.parser) {
    case "rss":
      return parseRssEntries(body, source, now);
    case "prs-billtrack":
      return parsePrsBillTrack(body, source.url, source.limit ?? 30);
    case "sansad-bills":
      return parseSansadBills(body, now);
  }
}
