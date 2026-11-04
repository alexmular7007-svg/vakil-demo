import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyDisabledSources,
  extraFeedSources,
  isSourceDisabled,
  parseDisabledSources,
  parsePrsBillTrack,
  parseSansadBills,
  parseSource,
  SOURCE_DEFAULTS,
  SOURCES,
} from "./sources";

const fixture = (name: string) => readFileSync(path.resolve(process.cwd(), "test/fixtures/updates", name), "utf8");
const NOW = new Date("2026-11-03T18:00:00Z");

describe("source list", () => {
  it("has unique keys, https URLs and a note for every source", () => {
    expect(new Set(SOURCES.map((s) => s.key)).size).toBe(SOURCES.length);
    for (const s of SOURCES) {
      expect(s.url.startsWith("https://")).toBe(true);
      expect(s.note.length).toBeGreaterThan(20);
    }
  });

  it("keeps Bar & Bench off until the publisher permits it", () => {
    expect(SOURCES.find((s) => s.key === "barandbench")?.enabled).toBe(false);
  });

  it("reads EXTRA_UPDATE_FEEDS: https only, de-duplicated", () => {
    const extra = extraFeedSources(" https://example.org/feed.xml, http://insecure.example/rss ,https://example.org/feed.xml,not a url\nhttps://news.example.in/atom");
    expect(extra.map((s) => s.url)).toEqual(["https://example.org/feed.xml", "https://news.example.in/atom"]);
    expect(extra[0]).toMatchObject({ parser: "rss", kind: "news", enabled: true, name: "example.org" });
    expect(extraFeedSources(undefined)).toEqual([]);
  });
});

describe("Sansad bills (sansad.in getBills JSON)", () => {
  const entries = parseSansadBills(fixture("sansad-bills.json"), NOW);

  it("creates one entry per bill introduced, linking the official bill text", () => {
    const tribunals = entries.find((e) => e.title === "The Tribunals Reforms Bill, 2026");
    expect(tribunals).toMatchObject({ kind: "bill" });
    expect(tribunals?.url).toMatch(/^https:\/\/sansad\.in\/getFile\/BillsTexts\/LSBillTexts\/Asintroduced\/.+\.pdf\?source=legislation$/);
    expect(tribunals?.url).not.toContain(" ");
    expect(tribunals?.publishedAt?.toISOString()).toBe("2026-08-09T18:30:00.000Z");
    expect(tribunals?.summary).toBe("Government bill introduced in Lok Sabha on 10 Aug 2026 (Bill No. 153). Status: Passed.");
  });

  it("adds an Act entry when the bill received assent, and never duplicates a URL", () => {
    const act = entries.find((e) => e.title === "The Appropriation (No. 3) Act, 2026");
    expect(act).toMatchObject({ kind: "act" });
    expect(act?.summary).toMatch(/assent on 11 Aug 2026 as Act No\. 13 of 2026/);
    const amend = entries.find((e) => e.title === "The Taxation and Other Laws (Amendment) Act, 2026");
    expect(amend?.kind).toBe("amendment");
    expect(new Set(entries.map((e) => e.url)).size).toBe(entries.length);
    // Bills still pending have no Act entry.
    expect(entries.filter((e) => e.title.startsWith("The Indian Statistical Institute"))).toHaveLength(1);
  });

  it("fails loudly on an unexpected response", () => {
    expect(() => parseSansadBills('{"error":"x"}')).toThrow(/unexpected response/);
  });
});

describe("PRS Bill Track (HTML listing)", () => {
  const entries = parsePrsBillTrack(fixture("prs-billtrack.html"));

  it("reads title, status and absolute link of each row", () => {
    expect(entries).toHaveLength(8);
    expect(entries[0]).toMatchObject({
      title: "The Occupational Safety, Health and Working Conditions (Central) Rules, 2026",
      url: "https://prsindia.org/billtrack/the-occupational-safety-health-and-working-conditions-central-rules-2026",
      kind: "notification",
      categories: ["Rules"],
      publishedAt: null,
    });
    const bill = entries.find((e) => e.title === "The Tribunals Reforms Bill, 2026");
    expect(bill).toMatchObject({ summary: "Bill tracked by PRS Legislative Research. Status: Passed.", kind: undefined });
  });

  it("throws when the layout changes, so the run records an error", () => {
    expect(() => parsePrsBillTrack("<html><body>maintenance</body></html>")).toThrow(/no rows/);
  });
});

describe("generic RSS sources", () => {
  it("dates Indian Kanoon judgments from their titles and tags them Supreme Court", () => {
    const ik = SOURCES.find((s) => s.key === "indiankanoon-sc")!;
    const entries = parseSource(ik, fixture("indiankanoon-sc.rss.xml"), NOW);
    expect(entries).toHaveLength(3);
    expect(entries[0].publishedAt?.toISOString()).toBe("2026-11-01T18:30:00.000Z");
    expect(entries[0].categories).toContain("Supreme Court");
    expect(entries.every((e) => (e.summary ?? "").length <= 200)).toBe(true);
  });
});

describe("DISABLED_UPDATE_SOURCES", () => {
  it("reads keys, lower-cased and de-duplicated, ignoring junk", () => {
    expect(parseDisabledSources(" PRS-billtrack, india_code\nprs-billtrack, extra:*, <script> ")).toEqual(["prs-billtrack", "india_code", "extra:*"]);
    expect(parseDisabledSources(undefined)).toEqual([]);
  });

  it("matches exact keys and prefixes ending in *", () => {
    expect(isSourceDisabled("india_code", ["india_code"])).toBe(true);
    expect(isSourceDisabled("extra:example.org:1", ["extra:*"])).toBe(true);
    expect(isSourceDisabled("scc-times", ["extra:*", "sansad-bills"])).toBe(false);
  });

  it("only switches sources off, and says why each one is off", () => {
    const out = applyDisabledSources(SOURCES, ["scc-times", "barandbench"]);
    expect(out.find((s) => s.key === "scc-times")).toMatchObject({ enabled: false, disabledBy: "env" });
    expect(out.find((s) => s.key === "barandbench")).toMatchObject({ enabled: false, disabledBy: "code" });
    expect(out.find((s) => s.key === "sansad-bills")).toMatchObject({ enabled: true });
    expect(out.find((s) => s.key === "sansad-bills")?.disabledBy).toBeUndefined();
    // Nothing in the env can switch on a source that is off for its terms of use.
    expect(applyDisabledSources(SOURCES, []).find((s) => s.key === "barandbench")?.enabled).toBe(false);
  });

  it("keeps every source within the per-source time budget", () => {
    for (const s of SOURCES) {
      const timeout = s.timeoutMs ?? SOURCE_DEFAULTS.timeoutMs;
      expect(timeout).toBeLessThanOrEqual(SOURCE_DEFAULTS.budgetMs);
      expect(s.retries ?? SOURCE_DEFAULTS.retries).toBeLessThanOrEqual(3);
    }
  });
});
