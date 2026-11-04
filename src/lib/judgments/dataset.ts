// Pure helpers for the open-dataset judgment importer (scripts/judgments/import.ts):
// S3 key layout of the Dattam Labs datasets, ListObjectsV2 parsing, the provenance
// (licence and attribution) every imported record carries, and the run summary.
// No I/O; unit-tested.

import { JUDGMENT_SOURCES, type JudgmentSource } from "./sources";

export type DatasetCourt = "sc" | "hc";

export const DATASET_REGION = "ap-south-1";

export function datasetSource(court: DatasetCourt): JudgmentSource {
  return court === "sc" ? JUDGMENT_SOURCES["aws-isc"] : JUDGMENT_SOURCES["aws-ihc"];
}

export function bucketUrl(source: JudgmentSource): string {
  if (!source.bucket) throw new Error(`${source.key} has no dataset bucket`);
  return `https://${source.bucket}.s3.${DATASET_REGION}.amazonaws.com`;
}

/** metadata/json/year=YYYY/[court=X_Y/] */
export function metadataPrefix(year: number, benchCourt?: string | null): string {
  return `metadata/json/year=${year}/${benchCourt ? `court=${benchCourt}/` : ""}`;
}

/** Dataset id of a metadata key: the file name without ".json". Stable across runs (idempotency key). */
export function externalIdOf(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1).replace(/\.json$/, "");
}

/** The judgment PDF that belongs to a metadata record. */
export function pdfKeyOf(key: string, court: DatasetCourt, year: number): string {
  return court === "sc" ? `data/pdf/year=${year}/english/${externalIdOf(key)}_EN.pdf` : key.replace(/^metadata\/json\//, "data/pdf/").replace(/\.json$/, ".pdf");
}

export function publicUrl(base: string, key: string): string {
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

const xmlText = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** One ListObjectsV2 page → the .json keys and the continuation token. Throws on an S3 error document. */
export function parseListPage(xml: string): { keys: string[]; next: string | null } {
  if (/<Error>/.test(xml) && !/<ListBucketResult/.test(xml)) {
    const code = /<Code>([^<]+)<\/Code>/.exec(xml)?.[1] ?? "unknown";
    throw new Error(`S3 listing failed (${code})`);
  }
  if (!/<ListBucketResult/.test(xml)) throw new Error("S3 listing: unexpected response");
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => xmlText(m[1])).filter((k) => k.endsWith(".json"));
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const next = truncated ? (/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? null) : null;
  return { keys, next: next ? xmlText(next) : null };
}

/** Licence and attribution stored with, and shown for, every record of a source. */
export function provenance(source: JudgmentSource, accessedOn: string) {
  return { sourceKey: source.key, licence: source.licence, licenceUrl: source.licenceUrl, publisher: source.publisher, attribution: source.attribution(accessedOn) };
}

export type ImportOutcome = { key: string; status: "imported" | "skipped" | "failed"; reason?: string; title?: string; paras?: number; attempts?: number };

export type ImportSummary = {
  court: DatasetCourt;
  year: number;
  benchCourt: string | null;
  limit: number;
  source: string;
  licence: string;
  attribution: string;
  listed: number;
  imported: number;
  skipped: number;
  failed: number;
  /** Requests retried after a transient error. */
  retried: number;
  /** First failures, "id: reason". */
  errors: string[];
  /** Failed record ids, so a later run (or a person) can look at them. */
  failedIds: string[];
  /** The listing stopped early (it still imported what it had found). */
  listingError: string | null;
};

const MAX_ERRORS = 20;
const MAX_FAILED_IDS = 200;

export function newSummary(init: Pick<ImportSummary, "court" | "year" | "benchCourt" | "limit">, source: JudgmentSource, accessedOn: string): ImportSummary {
  const p = provenance(source, accessedOn);
  return { ...init, source: source.key, licence: p.licence, attribution: p.attribution, listed: 0, imported: 0, skipped: 0, failed: 0, retried: 0, errors: [], failedIds: [], listingError: null };
}

/** Adds one record's outcome to the summary. */
export function record(summary: ImportSummary, o: ImportOutcome): void {
  if (o.status === "imported") summary.imported++;
  else if (o.status === "skipped") summary.skipped++;
  else {
    summary.failed++;
    const id = externalIdOf(o.key);
    if (summary.errors.length < MAX_ERRORS) summary.errors.push(`${id}: ${o.reason ?? "failed"}`);
    if (summary.failedIds.length < MAX_FAILED_IDS) summary.failedIds.push(id);
  }
}

/** ok: no failures; partial: some imported or the listing stopped early; failed: nothing worked. */
export function importStatus(s: Pick<ImportSummary, "imported" | "failed" | "skipped" | "listingError">): "ok" | "partial" | "failed" {
  if (s.failed === 0 && !s.listingError) return "ok";
  if (s.imported > 0) return "partial";
  // Only the listing broke, after finding records that were already imported.
  if (s.failed === 0 && s.skipped > 0) return "partial";
  return "failed";
}
