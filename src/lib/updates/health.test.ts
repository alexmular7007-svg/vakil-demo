import { describe, expect, it } from "vitest";
import { healthFromHistory, healthLevel, isStaleRun, nextHealth, STALE_RUN_MS } from "./health";

const at = (iso: string) => new Date(iso);

describe("source health", () => {
  it("counts failures in a row and resets on success", () => {
    const h1 = nextHealth(null, { ok: false, at: at("2026-11-01T00:00:00Z"), error: "HTTP 503" });
    expect(h1).toEqual({ consecutiveFailures: 1, lastSuccessAt: null, lastFailureAt: "2026-11-01T00:00:00.000Z", lastError: "HTTP 503" });
    const h2 = nextHealth(h1, { ok: false, at: at("2026-11-01T06:00:00Z"), error: "timed out" });
    expect(h2.consecutiveFailures).toBe(2);
    const h3 = nextHealth(h2, { ok: true, at: at("2026-11-01T12:00:00Z") });
    expect(h3).toEqual({ consecutiveFailures: 0, lastSuccessAt: "2026-11-01T12:00:00.000Z", lastFailureAt: "2026-11-01T06:00:00.000Z", lastError: null });
  });

  it("uses the health stored on the latest run", () => {
    const stored = { consecutiveFailures: 4, lastSuccessAt: "2026-10-30T00:00:00.000Z", lastFailureAt: "2026-11-01T00:00:00.000Z", lastError: "HTTP 403" };
    expect(healthFromHistory([{ ok: false, at: at("2026-11-01T00:00:00Z"), health: stored }])).toEqual(stored);
  });

  it("rebuilds health from runs recorded before health tracking", () => {
    const h = healthFromHistory([
      { ok: false, at: at("2026-11-02T00:00:00Z"), error: "HTTP 503" },
      { ok: false, at: at("2026-11-01T18:00:00Z"), error: "timed out" },
      { ok: true, at: at("2026-11-01T12:00:00Z") },
      { ok: false, at: at("2026-11-01T06:00:00Z") },
    ]);
    expect(h).toEqual({ consecutiveFailures: 2, lastSuccessAt: "2026-11-01T12:00:00.000Z", lastFailureAt: "2026-11-02T00:00:00.000Z", lastError: "HTTP 503" });
    expect(healthFromHistory([])).toBeNull();
    expect(healthFromHistory([{ ok: false, at: at("2026-11-02T00:00:00Z") }])?.lastSuccessAt).toBeNull();
  });

  it("grades health for the admin page", () => {
    expect(healthLevel(null)).toBe("unknown");
    expect(healthLevel({ consecutiveFailures: 0, lastSuccessAt: "2026-11-01T00:00:00.000Z", lastFailureAt: null, lastError: null })).toBe("ok");
    expect(healthLevel({ consecutiveFailures: 2, lastSuccessAt: null, lastFailureAt: null, lastError: null })).toBe("degraded");
    expect(healthLevel({ consecutiveFailures: 3, lastSuccessAt: null, lastFailureAt: null, lastError: null })).toBe("down");
  });
});

describe("stale runs", () => {
  const now = at("2026-11-04T10:00:00Z");
  it("is stale after 30 minutes without a start or heartbeat", () => {
    expect(STALE_RUN_MS).toBe(30 * 60_000);
    expect(isStaleRun({ startedAt: at("2026-11-04T09:29:00Z") }, now)).toBe(true);
    expect(isStaleRun({ startedAt: at("2026-11-04T09:31:00Z") }, now)).toBe(false);
  });
  it("counts a recent heartbeat as a sign of life", () => {
    expect(isStaleRun({ startedAt: at("2026-11-04T08:00:00Z"), summary: { heartbeatAt: "2026-11-04T09:58:00Z" } }, now)).toBe(false);
    expect(isStaleRun({ startedAt: at("2026-11-04T08:00:00Z"), summary: { heartbeatAt: "garbage" } }, now)).toBe(true);
  });
});
