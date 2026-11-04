import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError, BadRequestError, InternalServerError, RateLimitError } from "@anthropic-ai/sdk";
import { ApiError as GoogleApiError } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, CircuitBreaker, classifyError, kindForStatus, sleep, Watchdog } from "./resilience";

describe("failure classification", () => {
  it("maps HTTP statuses", () => {
    expect(kindForStatus(429)).toBe("rate_limit");
    expect(kindForStatus(529)).toBe("overloaded");
    expect(kindForStatus(503)).toBe("server");
    expect(kindForStatus(401)).toBe("auth");
    expect(kindForStatus(400)).toBe("bad_request");
  });

  it("classifies Anthropic SDK errors, including retry-after", () => {
    const rl = classifyError(new RateLimitError(429, {}, "slow down", new Headers({ "retry-after": "2" })));
    expect(rl).toMatchObject({ kind: "rate_limit", retryable: true, failover: true, countsForBreaker: true, retryAfterMs: 2000 });
    expect(classifyError(new InternalServerError(500, {}, "boom", new Headers()))).toMatchObject({ kind: "server", retryable: true });
    expect(classifyError(new BadRequestError(400, {}, "bad", new Headers()))).toMatchObject({
      kind: "bad_request",
      retryable: false,
      countsForBreaker: false,
      failover: true,
    });
    expect(classifyError(new APIConnectionTimeoutError())).toMatchObject({ kind: "timeout", retryable: true });
    expect(classifyError(new APIConnectionError({ message: "reset" }))).toMatchObject({ kind: "network", retryable: true });
    expect(classifyError(new APIUserAbortError())).toMatchObject({ kind: "aborted", retryable: false, failover: false });
  });

  it("classifies an error event inside an Anthropic stream by its type", () => {
    const err = new APIError(undefined, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", undefined);
    expect(classifyError(err)).toMatchObject({ kind: "overloaded", retryable: true });
  });

  it("classifies Google errors and plain network failures", () => {
    expect(classifyError(new GoogleApiError({ message: "quota", status: 429 }))).toMatchObject({ kind: "rate_limit", retryable: true });
    expect(classifyError(new GoogleApiError({ message: "bad", status: 400 }))).toMatchObject({ kind: "bad_request", retryable: false });
    expect(classifyError(new TypeError("fetch failed"))).toMatchObject({ kind: "network", retryable: true });
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(classifyError(abort).kind).toBe("aborted");
    expect(classifyError(new Error("something odd"))).toMatchObject({ kind: "unknown", retryable: false, failover: true });
  });
});

describe("backoff", () => {
  const opts = { baseDelayMs: 500, maxDelayMs: 8_000 };

  it("grows exponentially with jitter inside [step/2, step], capped", () => {
    expect(backoffDelay(0, opts, undefined, () => 0)).toBe(250);
    expect(backoffDelay(0, opts, undefined, () => 1)).toBe(500);
    expect(backoffDelay(2, opts, undefined, () => 0.5)).toBe(1_500);
    expect(backoffDelay(10, opts, undefined, () => 1)).toBe(8_000);
    for (let i = 0; i < 50; i++) {
      const d = backoffDelay(3, opts)!;
      expect(d).toBeGreaterThanOrEqual(2_000);
      expect(d).toBeLessThanOrEqual(4_000);
    }
  });

  it("waits at least the server's retry-after, and gives up when it exceeds the cap", () => {
    expect(backoffDelay(0, opts, 3_000, () => 0)).toBe(3_000);
    expect(backoffDelay(0, opts, 60_000)).toBeNull();
  });

  it("sleep stops early when aborted", async () => {
    const ac = new AbortController();
    const p = sleep(10_000, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("circuit breaker", () => {
  it("opens after consecutive failures, probes once after the cool-down, closes on success", () => {
    let now = 0;
    const b = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1_000 }, () => now);
    b.onFailure();
    b.onFailure();
    b.onSuccess(); // a success resets the count
    b.onFailure();
    b.onFailure();
    expect(b.state).toBe("closed");
    b.onFailure();
    expect(b.state).toBe("open");
    expect(b.tryAcquire()).toBe(false);
    expect(b.retryInMs).toBe(1_000);

    now = 1_000;
    expect(b.tryAcquire()).toBe(true); // the probe
    expect(b.state).toBe("half_open");
    expect(b.tryAcquire()).toBe(false); // only one probe at a time
    b.onSuccess();
    expect(b.state).toBe("closed");
    expect(b.tryAcquire()).toBe(true);
  });

  it("re-opens when the probe fails and frees the probe slot on release", () => {
    let now = 0;
    const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100 }, () => now);
    b.onFailure();
    now = 100;
    expect(b.tryAcquire()).toBe(true);
    b.onFailure();
    expect(b.state).toBe("open");
    now = 200;
    expect(b.tryAcquire()).toBe(true);
    b.release(); // e.g. cancelled: no verdict
    expect(b.tryAcquire()).toBe(true);
  });
});

describe("watchdog", () => {
  afterEach(() => vi.useRealTimers());

  it("aborts after the idle time, resets on activity, and remembers why", () => {
    vi.useFakeTimers();
    const w = new Watchdog(100, Date.now() + 10_000);
    vi.advanceTimersByTime(80);
    w.kick();
    vi.advanceTimersByTime(80);
    expect(w.signal.aborted).toBe(false);
    vi.advanceTimersByTime(30);
    expect(w.signal.aborted).toBe(true);
    expect(w.reason).toBe("timeout");
  });

  it("aborts at the deadline and when the caller's signal fires", () => {
    vi.useFakeTimers();
    const w = new Watchdog(10_000, Date.now() + 50);
    vi.advanceTimersByTime(60);
    expect(w.reason).toBe("deadline");

    const parent = new AbortController();
    const w2 = new Watchdog(10_000, Date.now() + 10_000, parent.signal);
    parent.abort();
    expect(w2.reason).toBe("caller");
    expect(w2.signal.aborted).toBe(true);
    w2.dispose();
  });
});
