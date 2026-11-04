import { describe, expect, it } from "vitest";
import { bucketUrl, datasetSource, externalIdOf, importStatus, metadataPrefix, newSummary, parseListPage, pdfKeyOf, provenance, publicUrl, record } from "./dataset";
import { JUDGMENT_SOURCES } from "./sources";

describe("dataset layout", () => {
  it("maps metadata keys to stable ids and their PDFs", () => {
    const sc = "metadata/json/year=2024/2024_1_234_567.json";
    expect(externalIdOf(sc)).toBe("2024_1_234_567");
    expect(pdfKeyOf(sc, "sc", 2024)).toBe("data/pdf/year=2024/english/2024_1_234_567_EN.pdf");
    const hc = "metadata/json/year=2024/court=27_1/bench=nagpur/HCBM010012342024_1_2024-02-01.json";
    expect(pdfKeyOf(hc, "hc", 2024)).toBe("data/pdf/year=2024/court=27_1/bench=nagpur/HCBM010012342024_1_2024-02-01.pdf");
    expect(metadataPrefix(2024, "27_1")).toBe("metadata/json/year=2024/court=27_1/");
    expect(metadataPrefix(2024)).toBe("metadata/json/year=2024/");
  });

  it("builds public HTTPS URLs on the right buckets", () => {
    expect(bucketUrl(datasetSource("sc"))).toBe("https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com");
    expect(bucketUrl(datasetSource("hc"))).toBe("https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com");
    expect(publicUrl("https://b.example", "data/pdf/year=2024/a b.pdf")).toBe("https://b.example/data/pdf/year%3D2024/a%20b.pdf");
  });

  it("reads a ListObjectsV2 page and its continuation token", () => {
    const xml = `<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated>
      <Contents><Key>metadata/json/year=2024/a.json</Key></Contents>
      <Contents><Key>metadata/json/year=2024/readme.txt</Key></Contents>
      <Contents><Key>metadata/json/year=2024/b&amp;c.json</Key></Contents>
      <NextContinuationToken>tok&amp;en</NextContinuationToken></ListBucketResult>`;
    expect(parseListPage(xml)).toEqual({ keys: ["metadata/json/year=2024/a.json", "metadata/json/year=2024/b&c.json"], next: "tok&en" });
    expect(parseListPage("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>")).toEqual({ keys: [], next: null });
    expect(() => parseListPage("<Error><Code>SlowDown</Code></Error>")).toThrow("S3 listing failed (SlowDown)");
    expect(() => parseListPage("<html>maintenance</html>")).toThrow(/unexpected response/);
  });
});

describe("provenance", () => {
  it("takes licence and attribution from the source definition, the same for every record", () => {
    for (const court of ["sc", "hc"] as const) {
      const src = datasetSource(court);
      const p = provenance(src, "2026-11-04");
      expect(p.licence).toBe("CC-BY-4.0");
      expect(p.licenceUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
      expect(p.attribution).toContain("accessed on 2026-11-04");
      expect(p.attribution).toContain("CC BY 4.0");
      expect(p.sourceKey).toBe(JUDGMENT_SOURCES[src.key].key);
    }
  });
});

describe("run summary", () => {
  const fresh = () => newSummary({ court: "sc", year: 2024, benchCourt: null, limit: 5 }, datasetSource("sc"), "2026-11-04");

  it("counts outcomes and keeps the first failures for the report", () => {
    const s = fresh();
    expect(s).toMatchObject({ source: "aws-isc", licence: "CC-BY-4.0" });
    record(s, { key: "metadata/json/year=2024/a.json", status: "imported" });
    record(s, { key: "metadata/json/year=2024/b.json", status: "skipped" });
    record(s, { key: "metadata/json/year=2024/c.json", status: "failed", reason: "not a PDF" });
    expect(s).toMatchObject({ imported: 1, skipped: 1, failed: 1, errors: ["c: not a PDF"], failedIds: ["c"] });
    for (let i = 0; i < 30; i++) record(s, { key: `x/${i}.json`, status: "failed", reason: "HTTP 404" });
    expect(s.errors).toHaveLength(20);
    expect(s.failedIds).toHaveLength(31);
  });

  it("is ok, partial or failed", () => {
    expect(importStatus({ imported: 3, failed: 0, skipped: 0, listingError: null })).toBe("ok");
    expect(importStatus({ imported: 0, failed: 0, skipped: 0, listingError: null })).toBe("ok");
    expect(importStatus({ imported: 2, failed: 1, skipped: 0, listingError: null })).toBe("partial");
    expect(importStatus({ imported: 2, failed: 0, skipped: 0, listingError: "HTTP 503" })).toBe("partial");
    expect(importStatus({ imported: 0, failed: 0, skipped: 4, listingError: "HTTP 503" })).toBe("partial");
    expect(importStatus({ imported: 0, failed: 2, skipped: 0, listingError: null })).toBe("failed");
    expect(importStatus({ imported: 0, failed: 0, skipped: 0, listingError: "HTTP 503" })).toBe("failed");
  });
});
