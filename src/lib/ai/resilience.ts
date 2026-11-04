import "server-only";
import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "@anthropic-ai/sdk";
import { ApiError as GoogleApiError } from "@google/genai";
import type { AiFailureKind } from "./errors";

/* ----------------------------- failure classification ----------------------------- */

export type Failure = {
  kind: AiFailureKind;
  status?: number;
  /** Worth another attempt on the same provider (before any text was sent). */
  retryable: boolean;
  /** Worth trying the other provider. */
  failover: boolean;
  /** Counts towards opening the provider's circuit. */
  countsForBreaker: boolean;
  /** Server-requested wait before retrying, when given. */
  retryAfterMs?: number;
};

const RETRYABLE: ReadonlySet<AiFailureKind> = new Set(["rate_limit", "overloaded", "server", "network", "timeout"]);
// Provider-health failures. A rejected request (400) says nothing about the provider.
const BREAKER: ReadonlySet<AiFailureKind> = new Set(["rate_limit", "overloaded", "server", "network", "timeout", "auth"]);
// Cancellation and the overall deadline end the request; anything else may succeed elsewhere.
const NO_FAILOVER: ReadonlySet<AiFailureKind> = new Set(["aborted", "deadline"]);

export function failure(kind: AiFailureKind, extra: { status?: number; retryAfterMs?: number } = {}): Failure {
  return {
    kind,
    ...extra,
    retryable: RETRYABLE.has(kind),
    failover: !NO_FAILOVER.has(kind),
    countsForBreaker: BREAKER.has(kind),
  };
}

export function kindForStatus(status: number): AiFailureKind {
  if (status === 429) return "rate_limit";
  if (status === 529) return "overloaded";
  if (status === 408) return "timeout";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "server";
  if (status >= 400) return "bad_request";
  return "unknown";
}

// Error types Anthropic sends inside a stream (no HTTP status on those).
const ANTHROPIC_TYPES: Record<string, AiFailureKind> = {
  overloaded_error: "overloaded",
  rate_limit_error: "rate_limit",
  api_error: "server",
  timeout_error: "timeout",
  authentication_error: "auth",
  permission_error: "auth",
  invalid_request_error: "bad_request",
  not_found_error: "bad_request",
  request_too_large: "bad_request",
};

function retryAfter(headers: Headers | undefined | null): number | undefined {
  if (!headers || typeof headers.get !== "function") return undefined;
  const ms = Number(headers.get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

const NETWORK_CODES = /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|UND_ERR|socket|network|fetch failed/i;

/** Maps an SDK or network error to a failure kind. */
export function classifyError(err: unknown): Failure {
  // Anthropic SDK (order matters: the connection errors extend APIError).
  if (err instanceof APIUserAbortError) return failure("aborted");
  if (err instanceof APIConnectionTimeoutError) return failure("timeout");
  if (err instanceof APIConnectionError) return failure("network");
  if (err instanceof APIError) {
    const after = retryAfter(err.headers);
    if (typeof err.status === "number") return failure(kindForStatus(err.status), { status: err.status, retryAfterMs: after });
    const type = (err.type ?? (err.error as { error?: { type?: string } } | undefined)?.error?.type) as string | undefined;
    return failure((type && ANTHROPIC_TYPES[type]) || "server", { retryAfterMs: after });
  }
  // Google Gen AI SDK.
  if (err instanceof GoogleApiError) return failure(kindForStatus(err.status), { status: err.status });
  if (err instanceof Error) {
    if (err.name === "AbortError") return failure("aborted");
    if (err.name === "TimeoutError") return failure("timeout");
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    if (NETWORK_CODES.test(`${err.message} ${cause?.code ?? ""} ${cause?.message ?? ""}`)) return failure("network");
  }
  return failure("unknown");
}

/* ----------------------------- backoff ----------------------------- */

/**
 * Exponential backoff with jitter: half the exponential step plus a random
 * share of the other half, capped. A server's retry-after is honoured; when it
 * asks for longer than the cap, returns null (do not retry this provider now).
 */
export function backoffDelay(
  attempt: number,
  opts: { baseDelayMs: number; maxDelayMs: number },
  retryAfterMs?: number,
  random: () => number = Math.random,
): number | null {
  if (retryAfterMs !== undefined && retryAfterMs > opts.maxDelayMs) return null;
  const step = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt);
  const jittered = step / 2 + random() * (step / 2);
  return Math.round(Math.min(opts.maxDelayMs, Math.max(jittered, retryAfterMs ?? 0)));
}

/** Resolves after `ms`, or rejects with an AbortError when the signal fires first. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError() {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

/* ----------------------------- circuit breaker ----------------------------- */

export type BreakerState = "closed" | "open" | "half_open";

/**
 * In-memory circuit breaker for one provider (per server instance). Closed: all
 * requests pass. After `failureThreshold` consecutive provider failures it opens
 * and rejects requests for `cooldownMs`; then it lets one probe through
 * (half-open). The probe's success closes it; its failure opens it again.
 */
export class CircuitBreaker {
  private state_: BreakerState = "closed";
  private failures = 0;
  private openedAt = 0;
  private probing = false;

  constructor(
    private readonly opts: { failureThreshold: number; cooldownMs: number },
    private readonly now: () => number = Date.now,
  ) {}

  get state(): BreakerState {
    return this.state_;
  }

  /** Remaining cool-down in ms while open (0 otherwise). */
  get retryInMs(): number {
    return this.state_ === "open" ? Math.max(0, this.openedAt + this.opts.cooldownMs - this.now()) : 0;
  }

  /** May a request go to this provider now? In half-open state only one probe at a time. */
  tryAcquire(): boolean {
    if (this.state_ === "closed") return true;
    if (this.state_ === "open") {
      if (this.now() - this.openedAt < this.opts.cooldownMs) return false;
      this.state_ = "half_open";
      this.probing = true;
      return true;
    }
    if (this.probing) return false;
    this.probing = true;
    return true;
  }

  /** The provider answered: close the circuit. */
  onSuccess() {
    this.state_ = "closed";
    this.failures = 0;
    this.probing = false;
  }

  /** A provider-health failure. */
  onFailure() {
    if (this.state_ === "half_open") return this.open();
    this.failures += 1;
    if (this.failures >= this.opts.failureThreshold) this.open();
  }

  /** The attempt ended without saying anything about provider health (cancelled, bad request). */
  release() {
    if (this.state_ === "half_open") this.probing = false;
  }

  private open() {
    this.state_ = "open";
    this.openedAt = this.now();
    this.probing = false;
    this.failures = 0;
  }
}

/* ----------------------------- per-attempt watchdog ----------------------------- */

export type AbortReason = "timeout" | "deadline" | "caller";

/**
 * One AbortController per provider attempt. It aborts when the provider is idle
 * for `idleMs` (no first response, or no chunk for that long), when the overall
 * deadline passes, or when the caller's signal fires, and remembers which.
 */
export class Watchdog {
  readonly controller = new AbortController();
  reason: AbortReason | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private readonly deadline: ReturnType<typeof setTimeout> | null;
  private readonly onParentAbort = () => this.abort("caller");

  constructor(
    private readonly idleMs: number,
    deadlineAt: number,
    private readonly parent?: AbortSignal,
  ) {
    const left = deadlineAt - Date.now();
    this.deadline = setTimeout(() => this.abort("deadline"), Math.max(0, left));
    if (parent?.aborted) this.abort("caller");
    else parent?.addEventListener("abort", this.onParentAbort, { once: true });
    this.kick();
  }

  get signal() {
    return this.controller.signal;
  }

  /** Activity from the provider: restart the idle timer. */
  kick() {
    if (this.reason) return;
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.abort("timeout"), this.idleMs);
  }

  abort(reason: AbortReason) {
    if (this.reason) return;
    this.reason = reason;
    this.controller.abort();
    this.clearTimers();
  }

  dispose() {
    this.clearTimers();
    this.parent?.removeEventListener("abort", this.onParentAbort);
  }

  private clearTimers() {
    if (this.idle) clearTimeout(this.idle);
    if (this.deadline) clearTimeout(this.deadline);
    this.idle = null;
  }
}
