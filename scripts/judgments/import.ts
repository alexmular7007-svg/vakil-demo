/**
 * Imports judgments into the Vaakil judgments library from the open datasets on
 * the Registry of Open Data on AWS, published by Dattam Labs under CC BY 4.0:
 *
 *   Indian Supreme Court Judgments  s3://indian-supreme-court-judgments  (ap-south-1)
 *     metadata/json/year=YYYY/<path>.json           eCourts search-result HTML per judgment
 *     data/pdf/year=YYYY/english/<path>_EN.pdf      the judgment
 *   Indian High Court Judgments     s3://indian-high-court-judgments     (ap-south-1)
 *     metadata/json/year=YYYY/court=X_Y/bench=B/<id>.json
 *     data/pdf/year=YYYY/court=X_Y/bench=B/<id>.pdf
 *
 * Each record is downloaded only when it is not already in the library (idempotent
 * on sourceKey + externalId), and only as many as --limit asks for. Text comes
 * from the PDF's text layer (scanned PDFs are skipped), is split into numbered
 * paragraphs, and stored with the dataset's licence; the run summary records the
 * licence and attribution line. Transient network errors (time-outs, HTTP 429/5xx)
 * are retried with backoff; a bad record is skipped and reported, and never stops
 * the run. Every run is recorded in corpus.sync_runs (kind "judgments").
 *
 *   npx tsx --conditions=react-server scripts/judgments/import.ts --court sc --year 2024 --limit 50
 *   npx tsx --conditions=react-server scripts/judgments/import.ts --court hc --year 2024 --bench-court 27_1 --limit 20
 *   … --dry-run      list what would be imported, download nothing
 *   … --retries 2    extra attempts per request after a transient error (0–5)
 */
import "../load-env";
import { parseArgs } from "node:util";

const UA = "VaakilAI-judgments-importer/1.0 (+https://vaakil.com)";
const MAX_LIST = 5 * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;
const MAX_PDF = 60 * 1024 * 1024;

type Court = "sc" | "hc";

function usage(msg?: string): never {
  if (msg) console.error(`✗ ${msg}`);
  console.error("Usage: import.ts --court sc|hc --year YYYY [--limit 20] [--bench-court 27_1] [--concurrency 3] [--retries 2] [--dry-run]");
  process.exit(2);
}

const { values } = parseArgs({
  options: {
    court: { type: "string" },
    year: { type: "string" },
    limit: { type: "string", default: "20" },
    "bench-court": { type: "string" },
    concurrency: { type: "string", default: "3" },
    retries: { type: "string", default: "2" },
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

const court = values.court as Court;
if (court !== "sc" && court !== "hc") usage("--court must be sc or hc");
const year = Number(values.year);
if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear()) usage("--year must be a year from 1950");
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 1000) usage("--limit must be 1–1000");
const benchCourt = values["bench-court"];
if (benchCourt !== undefined && (court !== "hc" || !/^\d{1,2}_\d{1,2}$/.test(benchCourt))) usage("--bench-court is a High Court code like 27_1 (use with --court hc)");
const concurrency = Math.min(Math.max(Number(values.concurrency) || 3, 1), 6);
const retries = Number(values.retries);
if (!Number.isInteger(retries) || retries < 0 || retries > 5) usage("--retries must be 0–5");
const dryRun = values["dry-run"];

async function main() {
  // Imported only now: importing opens the database connection.
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { judgments } = await import("@/lib/db/schema");
  const { extractDocumentText } = await import("@/lib/documents/extract");
  const { sniffFile } = await import("@/lib/files/validate");
  const { parseHcMetadata, parseScMetadata } = await import("@/lib/judgments/ecourts");
  const ds = await import("@/lib/judgments/dataset");
  const { insertJudgment } = await import("@/lib/judgments/store");
  const { splitJudgmentParas } = await import("@/lib/judgments/text");
  const { fetchBytes } = await import("@/lib/updates/fetch");
  const { retry } = await import("@/lib/updates/retry");
  const { claimRuns, releaseAllLeases } = await import("@/lib/updates/runs");

  const source = ds.datasetSource(court);
  const base = ds.bucketUrl(source);
  const prefix = ds.metadataPrefix(year, benchCourt);
  const today = new Date().toISOString().slice(0, 10);
  const summary = ds.newSummary({ court, year, benchCourt: benchCourt ?? null, limit }, source, today);

  /** GET with a size cap; transient errors retried with backoff. */
  const get = (url: string, maxBytes: number, accept: string) =>
    retry(() => fetchBytes(url, { maxBytes, timeoutMs: 90_000, accept, userAgent: UA }), {
      retries,
      baseDelayMs: 2000,
      maxDelayMs: 15_000,
      onRetry: ({ attempt, delayMs, error }) => {
        summary.retried++;
        console.log(`  … ${(error as Error).message} for ${url.replace(base, "")}; retry ${attempt} in ${Math.round(delayMs / 1000)} s`);
      },
    });
  const decode = (b: Uint8Array) => new TextDecoder().decode(b);

  async function listPage(token: string | null) {
    const qs = new URLSearchParams({ "list-type": "2", prefix, "max-keys": "500" });
    if (token) qs.set("continuation-token", token);
    return ds.parseListPage(decode(await get(`${base}/?${qs}`, MAX_LIST, "application/xml")));
  }

  async function importOne(key: string): Promise<import("@/lib/judgments/dataset").ImportOutcome> {
    const externalId = ds.externalIdOf(key);
    try {
      let rec: Record<string, unknown>;
      try {
        rec = JSON.parse(decode(await get(ds.publicUrl(base, key), MAX_JSON, "application/json"))) as Record<string, unknown>;
      } catch (e) {
        if (e instanceof SyntaxError) return { key, status: "failed", reason: "metadata is not valid JSON" };
        throw e;
      }
      const meta = court === "sc" ? parseScMetadata(rec) : parseHcMetadata(rec);
      if (!meta) return { key, status: "failed", reason: "metadata could not be read" };

      const pdfKey = ds.pdfKeyOf(key, court, year);
      const pdf = await get(ds.publicUrl(base, pdfKey), MAX_PDF, "application/pdf");
      const type = sniffFile(pdf, "judgment.pdf");
      if (type?.kind !== "pdf") return { key, status: "failed", reason: "not a PDF" };
      const text = await extractDocumentText(pdf, type);
      if (!text.ok) return { key, status: "failed", reason: text.error };
      const { paras } = splitJudgmentParas(text.text);
      if (!paras.length) return { key, status: "failed", reason: "no paragraphs found (scanned PDF?)" };

      const row = await insertJudgment({
        court: meta.court,
        title: meta.title.slice(0, 500),
        decidedOn: meta.decidedOn,
        citation: meta.citation,
        caseNo: meta.caseNo,
        bench: meta.bench,
        sourceUrl: ds.publicUrl(base, pdfKey),
        // Licence from the dataset definition, never per record: one source, one licence.
        licence: source.licence,
        sourceKey: source.key,
        externalId,
        parties: null,
        summary: meta.summary,
        addedBy: null,
        paras,
      });
      if (!row) return { key, status: "skipped", reason: "already imported" };
      return { key, status: "imported", title: meta.title, paras: paras.length };
    } catch (e) {
      // Download, extraction or database error for this one record: report it and go on.
      return { key, status: "failed", reason: e instanceof Error ? e.message.slice(0, 300) : String(e) };
    }
  }

  console.log(`${source.name}: ${prefix} (limit ${limit}${dryRun ? ", dry run" : ""}, ${retries} retries)`);
  console.log(`Licence ${source.licence}. ${summary.attribution}`);

  const claim = dryRun ? null : await claimRuns(["judgments"], { trigger: "script", summary: { ...summary } });
  const lease = claim?.ok ? claim.lease : null;
  if (claim && !claim.ok) throw new Error("could not record the run");
  if (claim?.closedStale) console.log(`Closed ${claim.closedStale} earlier import run(s) that never finished.`);
  const stop = (signal: string) => {
    void releaseAllLeases(`Stopped (${signal}).`).finally(() => process.exit(130));
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  try {
    // 1. List keys page by page until `limit` new records are found. A listing error after
    //    retries ends the listing but not the run: what was found is still imported.
    const todo: string[] = [];
    let token: string | null = null;
    try {
      do {
        const page = await listPage(token);
        token = page.next;
        summary.listed += page.keys.length;
        const ids = page.keys.map(ds.externalIdOf);
        const have = ids.length
          ? new Set(
              (
                await db
                  .select({ externalId: judgments.externalId })
                  .from(judgments)
                  .where(and(eq(judgments.sourceKey, source.key), inArray(judgments.externalId, ids)))
              ).map((r) => r.externalId),
            )
          : new Set<string | null>();
        for (const k of page.keys) {
          if (todo.length >= limit) break;
          if (have.has(ds.externalIdOf(k))) summary.skipped++;
          else if (!todo.includes(k)) todo.push(k);
        }
      } while (token && todo.length < limit);
    } catch (e) {
      summary.listingError = e instanceof Error ? e.message : String(e);
      console.log(`! Listing stopped: ${summary.listingError}${todo.length ? ` (importing the ${todo.length} found so far)` : ""}`);
    }

    if (!todo.length) console.log("Nothing new to import.");
    if (dryRun) {
      todo.forEach((k) => console.log(`  would import ${k}`));
      console.log(`${todo.length} to import, ${summary.skipped} already in the library.`);
      return;
    }

    // 2. Download, extract, split and store, a few at a time.
    let i = 0;
    let lastBeat = Date.now();
    const worker = async () => {
      while (i < todo.length) {
        const key = todo[i++];
        const o = await importOne(key);
        ds.record(summary, o);
        if (o.status === "imported") console.log(`✓ ${o.title} (${o.paras} paras)`);
        else if (o.status === "failed") console.log(`✗ ${ds.externalIdOf(key)}: ${o.reason}`);
        if (lease && Date.now() - lastBeat > 60_000) {
          lastBeat = Date.now();
          await lease.heartbeat().catch(() => {});
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));

    const status = ds.importStatus(summary);
    const error = [summary.failed ? `${summary.failed} could not be imported` : "", summary.listingError ? `listing stopped: ${summary.listingError}` : ""].filter(Boolean).join("; ");
    await lease?.finish("judgments", status, { trigger: "script", ...summary }, error || null);
    console.log(
      `Done: ${summary.imported} imported, ${summary.skipped} already present, ${summary.failed} failed${summary.retried ? `, ${summary.retried} retried requests` : ""} (${status}).`,
    );
    if (summary.failedIds.length) console.log(`Failed ids: ${summary.failedIds.slice(0, 20).join(", ")}${summary.failedIds.length > 20 ? " …" : ""}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await lease?.finish("judgments", "failed", { trigger: "script", ...summary }, message.slice(0, 500));
    throw e;
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
