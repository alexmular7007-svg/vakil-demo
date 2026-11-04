import { describe, expect, it } from "vitest";
import { FetchError } from "./fetch";
import { backoffDelay, isTransientError, parseRetryAfter, retry } from "./retry";

const fakeClock = () => {
  let t = 0;
  const waits: number[] = [];
  return { now: () => t, sleep: async (ms: number) => void (waits.push(ms), (t += ms)), waits, advance: (ms: number) => (t += ms) };
};

describe("isTransientError", () => {
  it("retries time-outs, network errors, 408/425/429/5xx; not 403/404, size or format errors", () => {
    expect(isTransientError(new FetchError("timed out", undefined, { kind: "timeout" }))).toBe(true);
    expect(isTransientError(new FetchError("network error (ECONNRESET)"))).toBe(true);
    for (const s of [408, 425, 429, 500, 502, 503, 504]) expect(isTransientError(new FetchError(`HTTP ${s}`, s)), String(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 410]) expect(isTransientError(new FetchError(`HTTP ${s}`, s)), String(s)).toBe(false);
    expect(isTransientError(new FetchError("too large", undefined, { kind: "size" }))).toBe(false);
    expect(isTransientError(new FetchError("not JSON", undefined, { kind: "format" }))).toBe(false);
    expect(isTransientError(Object.assign(new Error("x"), { cause: { code: "ECONNREFUSED" } }))).toBe(true);
    expect(isTransientError(new Error("parse failed"))).toBe(false);
  });

  it("reads Retry-After in seconds or as a date", () => {
    expect(parseRetryAfter("7")).toBe(7000);
    expect(parseRetryAfter("Wed, 04 Nov 2026 10:00:30 GMT", Date.parse("2026-11-04T10:00:00Z"))).toBe(30_000);
    expect(parseRetryAfter("soon")).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });

  it("backs off exponentially with jitter, capped", () => {
    expect(backoffDelay(1, { baseDelayMs: 1000, random: () => 0.5 })).toBe(1000);
    expect(backoffDelay(3, { baseDelayMs: 1000, random: () => 0.5 })).toBe(4000);
    expect(backoffDelay(10, { baseDelayMs: 1000, maxDelayMs: 8000, random: () => 1 })).toBe(8000);
    expect(backoffDelay(1, { baseDelayMs: 1000, random: () => 0 })).toBe(500);
  });
});

describe("retry", () => {
  it("succeeds after transient failures, waiting between attempts", async () => {
    const c = fakeClock();
    let calls = 0;
    const out = await retry(
      async () => {
        calls++;
        if (calls < 3) throw new FetchError("HTTP 503", 503);
        return "ok";
      },
      { retries: 2, baseDelayMs: 1000, random: () => 0.5, sleep: c.sleep, now: c.now },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
    expect(c.waits).toEqual([1000, 2000]);
  });

  it("fails at once on a permanent error and after the last retry on a transient one", async () => {
    const c = fakeClock();
    let calls = 0;
    await expect(retry(async () => (calls++, Promise.reject(new FetchError("HTTP 403", 403))), { retries: 3, sleep: c.sleep, now: c.now })).rejects.toThrow("HTTP 403");
    expect(calls).toBe(1);
    calls = 0;
    await expect(retry(async () => (calls++, Promise.reject(new FetchError("HTTP 502", 502))), { retries: 2, sleep: c.sleep, now: c.now })).rejects.toThrow("HTTP 502");
    expect(calls).toBe(3);
  });

  it("honours Retry-After, and does not retry when the server asks for a longer pause than the cap", async () => {
    const c = fakeClock();
    let calls = 0;
    await retry(
      async () => {
        if (calls++ === 0) throw new FetchError("HTTP 429", 429, { retryAfterMs: 3000 });
        return 1;
      },
      { retries: 2, maxDelayMs: 10_000, sleep: c.sleep, now: c.now },
    );
    expect(c.waits).toEqual([3000]);
    calls = 0;
    await expect(
      retry(async () => (calls++, Promise.reject(new FetchError("HTTP 503", 503, { retryAfterMs: 120_000 }))), { retries: 2, maxDelayMs: 10_000, sleep: c.sleep, now: c.now }),
    ).rejects.toThrow("HTTP 503");
    expect(calls).toBe(1);
  });

  it("stops when the time budget would be exceeded and tells each attempt how long is left", async () => {
    const c = fakeClock();
    const remaining: number[] = [];
    await expect(
      retry(
        async ({ remainingMs }) => {
          remaining.push(remainingMs);
          c.advance(20_000); // each attempt times out after 20 s
          throw new FetchError("timed out", undefined, { kind: "timeout" });
        },
        { retries: 5, baseDelayMs: 1000, random: () => 0.5, budgetMs: 45_000, minAttemptMs: 5000, sleep: c.sleep, now: c.now },
      ),
    ).rejects.toThrow("timed out");
    // 20 s + 1 s wait + 20 s + 2 s wait leaves 2 s: too little for another attempt.
    expect(remaining).toEqual([45_000, 24_000]);
  });
});
