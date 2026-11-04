import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  actFingerprint,
  bitstreamsFrom,
  chapterForNew,
  diffSections,
  formatVersion,
  handleFromUrl,
  newActEntries,
  parseVersion,
  sectionsFromItems,
  sectionsHash,
  unsafeDiffReason,
  type CurrentSection,
  type DSpaceItem,
} from "./india-code-parse";

// Real India Code API responses for the Right to Information Act, 2005 (trimmed to the
// ACT record, three SECTION records and one RULE record), fetched 3 November 2026.
const fixture = (name: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), "test/fixtures/updates", name), "utf8"));
const items = fixture("indiacode-rti-items.json").items as DSpaceItem[];
const bundles = fixture("indiacode-rti-bundles.json");
const actItem = items.find((i) => i.metadata["dc.identifier.collection"]?.[0]?.value === "ACT")!;
// The committed corpus file the database was seeded from.
const corpus = JSON.parse(readFileSync(path.resolve(process.cwd(), "data/corpus/RTI.json"), "utf8")) as {
  sections: { no: string; heading: string; text: string; footnotes: string[]; chapter: string | null; sortKey: number }[];
};
const seeded = (no: string) => {
  const s = corpus.sections.find((x) => x.no === no)!;
  return { sectionNo: s.no, heading: s.heading, text: s.footnotes.length ? `${s.text}\n\nFootnotes:\n${s.footnotes.map((f, i) => `${i + 1}. ${f}`).join("\n")}` : s.text, chapter: s.chapter, sortKey: s.sortKey };
};

describe("act fingerprint", () => {
  const streams = bitstreamsFrom(bundles);

  it("lists the original files with sizes and checksums", () => {
    const originals = streams.filter((b) => b.bundle === "ORIGINAL");
    expect(originals.map((b) => b.name).sort()).toEqual(["A2005-22.pdf", "H2005-22.pdf"]);
    expect(originals[0].md5).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is stable, and changes when a PDF or the last-modified date changes", () => {
    const fp = actFingerprint(actItem, streams);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(actFingerprint(actItem, [...streams].reverse())).toBe(fp);
    // Thumbnails and extracted text do not count.
    expect(actFingerprint(actItem, streams.filter((b) => b.bundle === "ORIGINAL"))).toBe(fp);

    const newPdf = streams.map((b) => (b.name === "A2005-22.pdf" ? { ...b, size: b.size + 1200, md5: "0".repeat(32) } : b));
    expect(actFingerprint(actItem, newPdf)).not.toBe(fp);

    const touched = { ...actItem, metadata: { ...actItem.metadata, "dc.date.last_modified": [{ value: "2026-12-01" }] } };
    expect(actFingerprint(touched, streams)).not.toBe(fp);
  });

  it("round-trips the stored version string", () => {
    expect(parseVersion(formatVersion("abc123", "def456"))).toEqual({ fp: "abc123", sections: "def456" });
    expect(parseVersion(formatVersion("abc123", null))).toEqual({ fp: "abc123", sections: null });
    expect(parseVersion(null)).toEqual({ fp: null, sections: null });
    expect(parseVersion("something else")).toEqual({ fp: null, sections: null });
  });
});

describe("section parsing matches the seeded corpus", () => {
  const parsed = sectionsFromItems(items);

  it("reads only SECTION records, in India Code order", () => {
    expect(parsed.map((s) => s.no)).toEqual(["1", "2", "16"]);
    expect(parsed[0].sourceUrl).toMatch(/^https:\/\/indiacode\.gov\.in\/handle\/123456789\/\d+$/);
  });

  it("produces exactly the heading and text the seed stored (no diff for an unchanged act)", () => {
    for (const s of parsed) {
      const cur = seeded(s.no);
      expect(s.heading).toBe(cur.heading);
      expect(s.text).toBe(cur.text);
    }
    const diff = diffSections(parsed.map((s) => seeded(s.no)), parsed);
    expect(diff).toMatchObject({ added: [], changed: [], removed: [], unchanged: 3 });
  });
});

describe("change detection on an amended act", () => {
  const parsed = sectionsFromItems(items);
  const current: CurrentSection[] = [seeded("1"), seeded("2"), seeded("16"), seeded("17")];

  // India Code now: s. 2 amended, s. 16A inserted, s. 17 omitted.
  const amended = parsed.map((s) => (s.no === "2" ? { ...s, text: `${s.text}\n\n(k) "digital record" means a record kept in electronic form.` } : s));
  amended.push({ no: "16A", order: 16.5, heading: "Appeal to the Information Commission online", text: "Appeals may be filed electronically.", sourceUrl: null });

  it("finds changed, added and removed sections", () => {
    const diff = diffSections(current, amended);
    expect(diff.changed.map((s) => s.no)).toEqual(["2"]);
    expect(diff.added.map((s) => s.no)).toEqual(["16A"]);
    expect(diff.removed).toEqual(["17"]);
    expect(diff.unchanged).toBe(2);
  });

  it("changes the section hash only when the text changes", () => {
    expect(sectionsHash(parsed)).toBe(sectionsHash([...parsed].reverse()));
    expect(sectionsHash(amended)).not.toBe(sectionsHash(parsed));
  });

  it("puts a new section in the chapter of the section before it", () => {
    const withChapters = current.map((c) => ({ ...c, chapter: c.sectionNo === "16" ? "Chapter V: Powers and Functions" : c.chapter }));
    const ordered = [...amended].sort((a, b) => a.order - b.order);
    expect(chapterForNew(ordered, withChapters, "16A")).toBe("Chapter V: Powers and Functions");
  });

  it("refuses diffs that look like a failed read", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ sectionNo: String(i + 1), heading: "h", text: "t", chapter: null, sortKey: i }));
    const few = many.slice(0, 50).map((c, i) => ({ no: c.sectionNo, order: i, heading: "h", text: "t", sourceUrl: null }));
    const d = diffSections(many, few);
    expect(unsafeDiffReason(d, many.length, few.length)).toMatch(/returned 50 sections where the corpus has 100/);
    const minus12 = many.slice(0, 88).map((c, i) => ({ no: c.sectionNo, order: i, heading: "h", text: "t", sourceUrl: null }));
    expect(unsafeDiffReason(diffSections(many, minus12), many.length, minus12.length)).toMatch(/12 sections would be removed/);
    expect(unsafeDiffReason(diffSections(current, amended), current.length, amended.length)).toBeNull();
  });
});

describe("new central Acts listing", () => {
  const search = fixture("indiacode-new-acts.json");

  it("turns ACT records into entries with India Code links and enactment dates", () => {
    const entries = newActEntries(search, new Set());
    expect(entries.map((e) => e.title)).toEqual([
      "The Kerala (Alteration of Name) Act, 2026",
      "The Tribunals Reforms Act, 2026",
      "The Central Armed Police Forces (General Administration) Act, 2026",
    ]);
    expect(entries[1].url).toBe("https://indiacode.gov.in/handle/123456789/619582");
    expect(entries[1].publishedAt?.toISOString()).toBe("2026-08-12T18:30:00.000Z");
    expect(entries[1].summary).toMatch(/^Act No\. 17 of 2026\./);
  });

  it("skips acts already in the corpus", () => {
    expect(newActEntries(search, new Set(["123456789/619582"])).map((e) => e.title)).not.toContain("The Tribunals Reforms Act, 2026");
  });

  it("reads handles from India Code URLs", () => {
    expect(handleFromUrl("https://indiacode.gov.in/handle/123456789/496548")).toBe("123456789/496548");
    expect(handleFromUrl("https://www.indiacode.nic.in/handle/123456789/1362?view_type=browse")).toBe("123456789/1362");
    expect(handleFromUrl("https://example.org/handle/1/2")).toBeNull();
  });
});
