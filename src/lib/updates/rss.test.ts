import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dateFromTitle, parseFeed, parseFeedDate } from "./rss";
import { clip, decodeEntities, htmlToText, normalizeUrl, titleCaseIfShouting, titleKey } from "./text";

// Fixtures are trimmed copies of the real feeds, fetched on 3 November 2026.
const fixture = (name: string) => readFileSync(path.resolve(process.cwd(), "test/fixtures/updates", name), "utf8");
const NOW = new Date("2026-11-03T18:00:00Z");

describe("parseFeed: real RSS 2.0 feeds", () => {
  it("reads Bar & Bench (empty description, article in content:encoded)", () => {
    const feed = parseFeed(fixture("barandbench.rss.xml"), NOW);
    expect(feed.format).toBe("rss");
    expect(feed.title).toBe("Barandbench");
    expect(feed.items).toHaveLength(3);
    const [a, , c] = feed.items;
    expect(a.title).toBe("Savarkar defamation: Kin alleges security lapse, failure to examine witnesses in Mahatma Gandhi killing");
    expect(a.link).toBe("https://www.barandbench.com/news/savarkar-defamation-kin-alleges-security-lapse-failure-to-examine-witnesses-in-mahatma-gandhi-killing");
    expect(a.published?.toISOString()).toBe("2026-11-03T16:25:37.000Z");
    expect(a.categories).toEqual(["News", "Litigation News"]);
    // No description: the first paragraph of the article, clipped.
    expect(a.summary).toMatch(/^Vinayak Savarkar was not involved/);
    expect(a.summary!.length).toBeLessThanOrEqual(200);
    // &apos; in a plain (non-CDATA) title
    expect(c.title).toContain("journalist's plea");
    // guid isPermaLink="false" is never used as the link
    expect(feed.items.every((i) => i.link?.startsWith("https://www.barandbench.com/"))).toBe(true);
  });

  it("reads SCC Times (CDATA description with the WordPress footer removed)", () => {
    const feed = parseFeed(fixture("scctimes.rss.xml"), NOW);
    expect(feed.title).toBe("SCC Times");
    expect(feed.items).toHaveLength(3);
    const a = feed.items[0];
    expect(a.title).toBe("Fake Supreme Court website alert: SC flags “scigovinjudicial.com” as phishing domain");
    expect(a.summary).toBe("The latest advisory follows earlier notices issued in 2023, 2025 and 2026 identifying multiple fake Supreme Court websites.");
    expect(a.published?.toISOString()).toBe("2026-11-03T13:00:07.000Z");
    expect(a.categories).toContain("Hot Off The Press");
  });

  it("reads Indian Kanoon (escaped HTML description, no pubDate)", () => {
    const feed = parseFeed(fixture("indiankanoon-sc.rss.xml"), NOW);
    expect(feed.title).toBe("Supreme Court of India");
    const a = feed.items[0];
    expect(a.title).toBe("Piyush S/O Deepak Narlawar vs State Of Maharashtra on 2 November, 2026");
    expect(a.link).toBe("https://indiankanoon.org/doc/84013884/");
    expect(a.published).toBeNull();
    expect(a.summary).toMatch(/^NAGARATHNA, J\. Leave granted\. 2\. This appeal arises/);
    expect(a.summary).not.toMatch(/<|&lt;|\s{2}/);
    expect(a.summary!.length).toBeLessThanOrEqual(200);
    expect(dateFromTitle(a.title)?.toISOString()).toBe("2026-11-01T18:30:00.000Z");
  });
});

describe("parseFeed: real Atom feed", () => {
  it("reads SCC Times Atom (html titles in CDATA, link rel=alternate, category terms)", () => {
    const feed = parseFeed(fixture("scctimes.atom.xml"), NOW);
    expect(feed.format).toBe("atom");
    expect(feed.title).toBe("SCC Times");
    expect(feed.items).toHaveLength(3);
    const [a, b] = feed.items;
    expect(a.title).toBe("Fake Supreme Court website alert: SC flags “scigovinjudicial.com” as phishing domain");
    expect(a.link).toBe("https://www.scconline.com/blog/post/2026/11/03/supreme-court-warns-fake-websites-phishing-scam-scigovinjudicial/");
    expect(a.published?.toISOString()).toBe("2026-11-03T13:00:07.000Z");
    expect(a.categories).toContain("Hot Off The Press");
    expect(a.guid).toBe("https://www.scconline.com/blog/?p=400460");
    // &#151; (Windows-1252 em dash) and &#214; decode to real characters
    expect(b.title).toContain("Mediation Council of India — Lessons");
    expect(b.title).toContain("Österle");
  });
});

describe("parseFeed: edge cases", () => {
  it("keeps markup inside CDATA from breaking item boundaries", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item><title><![CDATA[A & B </item> <b>bold</b>]]></title><link>https://example.org/a?utm_source=x</link>
        <description><![CDATA[<p>First &amp; best</p>]]></description></item>
      <item><title>Second &amp; last</title><guid>https://example.org/b</guid></item>
    </channel></rss>`;
    const feed = parseFeed(xml, NOW);
    expect(feed.items.map((i) => i.title)).toEqual(["A & B bold", "Second & last"]);
    expect(feed.items[0].summary).toBe("First & best");
    // A permalink guid stands in for a missing <link>.
    expect(feed.items[1].link).toBe("https://example.org/b");
    expect(feed.items[1].published).toBeNull();
  });

  it("reads RSS 1.0 (RDF) with dc:date", () => {
    const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel><title>Gazette</title></channel>
      <item rdf:about="https://example.org/n1"><title>Notification S.O. 123(E)</title><link>https://example.org/n1</link><dc:date>2026-10-30T10:00:00+05:30</dc:date></item>
    </rdf:RDF>`;
    const feed = parseFeed(xml, NOW);
    expect(feed.format).toBe("rdf");
    expect(feed.items[0].published?.toISOString()).toBe("2026-10-30T04:30:00.000Z");
  });

  it("rejects things that are not feeds", () => {
    expect(() => parseFeed("<html><body>Access Denied</body></html>")).toThrow(/Not an RSS or Atom feed/);
  });
});

describe("parseFeedDate", () => {
  it("reads RFC 822, ISO 8601 and Indian variants", () => {
    expect(parseFeedDate("Tue, 03 Nov 2026 21:55:37 +0530", NOW)?.toISOString()).toBe("2026-11-03T16:25:37.000Z");
    expect(parseFeedDate("Tue, 03 Nov 2026 21:55:37 IST", NOW)?.toISOString()).toBe("2026-11-03T16:25:37.000Z");
    expect(parseFeedDate("2026-11-03T13:00:07Z", NOW)?.toISOString()).toBe("2026-11-03T13:00:07.000Z");
    expect(parseFeedDate("2026-08-10 00:00:00.0", NOW)?.toISOString()).toBe("2026-08-09T18:30:00.000Z");
    expect(parseFeedDate("17/08/2026", NOW)?.toISOString()).toBe("2026-08-16T18:30:00.000Z");
  });

  it("returns null for missing, unreadable or far-future dates", () => {
    expect(parseFeedDate(null, NOW)).toBeNull();
    expect(parseFeedDate("", NOW)).toBeNull();
    expect(parseFeedDate("sometime soon", NOW)).toBeNull();
    expect(parseFeedDate("2031-01-01T00:00:00Z", NOW)).toBeNull();
  });
});

describe("text helpers", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("&ldquo;BNS&rdquo; &#8212; s. 103 &#x2013; &amp;c &unknown;")).toBe("“BNS” — s. 103 – &c &unknown;");
  });
  it("turns HTML into clean text", () => {
    expect(htmlToText("<p>One&nbsp;<em>two</em></p><script>x()</script><p>three</p>")).toBe("One two three");
  });
  it("clips on a word boundary within the limit", () => {
    const s = clip("word ".repeat(80), 200);
    expect(s.length).toBeLessThanOrEqual(200);
    expect(s.endsWith("…")).toBe(true);
    expect(clip("short", 200)).toBe("short");
  });
  it("normalises links for de-duplication", () => {
    expect(normalizeUrl("https://example.org/a?utm_source=rss&id=2#top")).toBe("https://example.org/a?id=2");
    expect(normalizeUrl("/billtrack/x", "https://prsindia.org/billtrack/category/all")).toBe("https://prsindia.org/billtrack/x");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });
  it("title-cases shouting titles only", () => {
    expect(titleCaseIfShouting("THE APPROPRIATION (NO. 3) BILL, 2026")).toBe("The Appropriation (No. 3) Bill, 2026");
    expect(titleCaseIfShouting("THE CONSTITUTION (ONE HUNDRED AND THIRTY-FIRST AMENDMENT) BILL, 2026")).toBe(
      "The Constitution (One Hundred and Thirty-First Amendment) Bill, 2026",
    );
    expect(titleCaseIfShouting("The Micro, Small and Medium Enterprises Bill")).toBe("The Micro, Small and Medium Enterprises Bill");
  });
  it("gives the same key to the same headline from different sources", () => {
    expect(titleKey("THE TRIBUNALS REFORMS BILL, 2026")).toBe(titleKey("The Tribunals Reforms Bill, 2026"));
  });
});
