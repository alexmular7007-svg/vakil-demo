// Limited retries with exponential backoff and jitter, for the updates sources, India
// Code and the judgments importer. Only transient failures are retried (time-outs,
// network errors, HTTP 408/425/429/5xx); a 403 or a parse error fails at once. A
// Retry-After longer than the backoff cap is respected by not retrying at all: the
// next scheduled run is the retry. Pure apart from the timer; testable with fake sleep.

export type RetryInfo = { attempt: number; delayMs: number; error: unknown };

export type RetryOptions = {
  /** Retries after the first attempt (0 = try once). */
  retries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Total time for all attempts and waits; no new attempt starts after it. */
  budgetMs?: number;
  /** A retry is only started when at least this much of the budget is left for it (default 1 s). */
  minAttemptMs?: number;
  /** Which errors are worth another attempt (default: isTransientError). */
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (info: RetryInfo) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
};

export type AttemptContext = { attempt: number; remainingMs: number };

/** HTTP statuses that usually mean "try again shortly". */
export const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

type ErrorLike = { status?: number; transient?: boolean; retryAfterMs?: number | null; name?: string; code?: string; cause?: { code?: string } };

/** True for time-outs, network errors and the HTTP statuses above. */
export function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as ErrorLike;
  if (typeof e.transient === "boolean") return e.transient;
  if (typeof e.status === "number") return TRANSIENT_STATUSES.has(e.status);
  if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  const code = e.code ?? e.cause?.code;
  return typeof code === "string" && /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|UND_ERR_\w+)$/.test(code);
}

/** Retry-After header → milliseconds (seconds or an HTTP date); null if absent or unreadable. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d{1,7}$/.test(v)) return Number(v) * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** Wait before retry number `attempt` (1-based): base·2^(attempt-1), capped, with ±50 % jitter. */
export function backoffDelay(attempt: number, opts: { baseDelayMs?: number; maxDelayMs?: number; random?: () => number } = {}): number {
  const base = opts.baseDelayMs ?? 1000;
  const cap = opts.maxDelayMs ?? 10_000;
  const raw = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  const jitter = 0.5 + (opts.random ?? Math.random)();
  return Math.round(Math.min(cap, raw * jitter));
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs fn until it succeeds, a non-transient error occurs, retries run out or the budget is spent. */
export async function retry<T>(fn: (ctx: AttemptContext) => Promise<T>, opts: RetryOptions): Promise<T> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const retryable = opts.isRetryable ?? isTransientError;
  const maxDelay = opts.maxDelayMs ?? 10_000;
  const budget = opts.budgetMs ?? Number.POSITIVE_INFINITY;
  const start = now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn({ attempt, remainingMs: Math.max(0, budget - (now() - start)) });
    } catch (err) {
      if (attempt > opts.retries || !retryable(err)) throw err;
      const asked = (err as ErrorLike | null)?.retryAfterMs;
      // A server asking for a longer pause than we would wait gets its pause: no retry now.
      if (typeof asked === "number" && asked > maxDelay) throw err;
      const delayMs = typeof asked === "number" ? Math.max(asked, 0) : backoffDelay(attempt, { baseDelayMs: opts.baseDelayMs, maxDelayMs: maxDelay, random: opts.random });
      // A retry needs time of its own, not just the wait before it.
      if (now() - start + delayMs + (opts.minAttemptMs ?? 1000) > budget) throw err;
      opts.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
    }
  }
}
