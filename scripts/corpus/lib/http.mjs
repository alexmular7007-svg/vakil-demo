// Polite HTTP helper for the corpus scripts: retries with backoff and an on-disk
// cache (node_modules/.cache, so it is never committed). Only GET requests to
// official sources are made; nothing here touches the database.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = process.env.CORPUS_CACHE_DIR ?? join(process.cwd(), "node_modules", ".cache", "vaakil-corpus");
const UA = "VaakilAI-corpus/1.0 (+https://www.vaakil.com; statute ingestion from official sources)";

mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cachePath(url) {
  return join(CACHE_DIR, createHash("sha1").update(url).digest("hex"));
}

/** GET a URL as a Buffer, with retries and caching. */
export async function getBuffer(url, { useCache = true, timeoutMs = 120_000, retries = 5 } = {}) {
  const file = cachePath(url);
  if (useCache && existsSync(file)) return readFileSync(file);
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      // Be gentle with government servers.
      await sleep(250);
      return buf;
    } catch (err) {
      lastErr = err;
      const wait = 1500 * (attempt + 1);
      console.warn(`  ! ${err.message ?? err} (retry ${attempt + 1}/${retries} in ${wait} ms)`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

export async function getJson(url, opts) {
  return JSON.parse((await getBuffer(url, opts)).toString("utf8"));
}

export async function getText(url, opts) {
  return (await getBuffer(url, opts)).toString("utf8");
}
