import "server-only";
import { parseRetryAfter, TRANSIENT_STATUSES } from "./retry";

// Polite HTTP for the updates job and the judgments importer: a clear User-Agent, a hard
// timeout and a size cap. Each failure is a FetchError that says whether it is
// transient (time-out, network, HTTP 408/425/429/5xx), so callers can retry those with
// backoff (see retry.ts) and fail fast on the rest.

export const UPDATES_USER_AGENT = "VaakilAI-updates/1.0 (+https://www.vaakil.com; legal-updates reader for advocates)";

export type FetchErrorKind = "timeout" | "network" | "http" | "size" | "format";

export class FetchError extends Error {
  readonly kind: FetchErrorKind;
  /** Worth retrying: time-outs, network errors and HTTP 408/425/429/5xx. */
  readonly transient: boolean;
  /** From a Retry-After header, when the server sent one. */
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    public status?: number,
    opts: { kind?: FetchErrorKind; retryAfterMs?: number | null } = {},
  ) {
    super(message);
    this.name = "FetchError";
    this.kind = opts.kind ?? (status !== undefined ? "http" : "network");
    this.transient = this.kind === "timeout" || this.kind === "network" || (this.kind === "http" && status !== undefined && TRANSIENT_STATUSES.has(status));
    this.retryAfterMs = opts.retryAfterMs ?? null;
  }
}

export type FetchOpts = { timeoutMs?: number; maxBytes?: number; accept?: string; userAgent?: string };

async function request(url: string, { timeoutMs, accept, userAgent }: { timeoutMs: number; accept: string; userAgent: string }): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: accept, "Accept-Language": "en-IN,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    const e = err as Error;
    if (e.name === "TimeoutError" || e.name === "AbortError") throw new FetchError(`timed out after ${Math.round(timeoutMs / 1000)} s`, undefined, { kind: "timeout" });
    const cause = (e as Error & { cause?: { code?: string } }).cause?.code;
    throw new FetchError(cause ? `network error (${cause})` : `network error (${e.message})`, undefined, { kind: "network" });
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new FetchError(`HTTP ${res.status}`, res.status, { kind: "http", retryAfterMs: parseRetryAfter(res.headers.get("retry-after")) });
  }
  return res;
}

/** Reads a body up to maxBytes; a stalled body still ends at the request's timeout. */
async function readCapped(res: Response, maxBytes: number, timeoutMs: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new FetchError(`response too large (${declared} bytes)`, undefined, { kind: "size" });
  }
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new FetchError(`response larger than ${Math.round(maxBytes / 1_000_000)} MB`, undefined, { kind: "size" });
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof FetchError) throw err;
    const e = err as Error;
    if (e.name === "TimeoutError" || e.name === "AbortError") throw new FetchError(`timed out after ${Math.round(timeoutMs / 1000)} s`, undefined, { kind: "timeout" });
    throw new FetchError(`network error (${e.message})`, undefined, { kind: "network" });
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return buf;
}

/** GET a URL as text. Throws FetchError with a short, loggable message on any failure. */
export async function fetchText(url: string, { timeoutMs = 20_000, maxBytes = 6_000_000, accept = "*/*", userAgent = UPDATES_USER_AGENT }: FetchOpts = {}): Promise<string> {
  const res = await request(url, { timeoutMs, accept, userAgent });
  const buf = await readCapped(res, maxBytes, timeoutMs);
  const charset = /charset=([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1]?.toLowerCase();
  try {
    return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

export async function fetchJson<T>(url: string, opts?: FetchOpts): Promise<T> {
  const text = await fetchText(url, { accept: "application/json", ...opts });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new FetchError("response was not JSON", undefined, { kind: "format" });
  }
}

/** Bytes (for PDFs and dataset files). */
export async function fetchBytes(url: string, { timeoutMs = 120_000, maxBytes = 40_000_000, accept = "application/pdf,*/*", userAgent = UPDATES_USER_AGENT }: FetchOpts = {}): Promise<Uint8Array> {
  const res = await request(url, { timeoutMs, accept, userAgent });
  return readCapped(res, maxBytes, timeoutMs);
}
