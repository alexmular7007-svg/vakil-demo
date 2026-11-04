import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: string },
  audits: [] as unknown[],
  revalidated: [] as string[],
  limited: false,
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => state.revalidated.push(p) }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: async () => state.user, requestIp: async () => "203.0.113.9" }));
vi.mock("@/lib/db", () => ({ withUser: async (_id: string, fn: (tx: unknown) => unknown) => fn({ tx: true }) }));
vi.mock("@/lib/audit", () => ({ appendAudit: async (e: unknown) => void state.audits.push(e) }));
vi.mock("@/lib/rate-limit", async () => {
  class RateLimitError extends Error {}
  return {
    RateLimitError,
    enforceRateLimit: async () => {
      if (state.limited) throw new RateLimitError("Too many requests. Try again shortly.");
    },
  };
});

const { defineAction } = await import("./define-action");
const { ActionError, ActionFieldError } = await import("./action");

const save = defineAction({
  input: z.object({ title: z.string().min(2, "Too short") }),
  rateLimit: { name: "test", limit: 1, windowSeconds: 60 },
  run: async ({ user, input }) => {
    if (input.title === "missing") throw new ActionError("Not found.");
    if (input.title === "badfield") throw new ActionFieldError("title", "Not allowed");
    if (input.title === "dbguard") throw Object.assign(new Error("check violation"), { code: "23514" });
    return { id: "r1", by: user.id };
  },
  audit: (input, r) => ({ action: "thing.saved", entityType: "thing", entityId: r.id, data: { title: input.title } }),
  revalidate: () => ["/app/things", null, "/app/things"],
});

const adminOnly = defineAction({ input: z.object({}), permission: "admin.console", run: async () => "ok" });

beforeEach(() => {
  state.user = { id: "u1", role: "user" };
  state.audits = [];
  state.revalidated = [];
  state.limited = false;
});

describe("defineAction", () => {
  it("refuses signed-out callers", async () => {
    state.user = null;
    expect(await save({ title: "hello" })).toEqual({ ok: false, error: "Please sign in." });
  });

  it("checks permissions", async () => {
    expect((await adminOnly({})).ok).toBe(false);
    state.user = { id: "a1", role: "admin" };
    expect(await adminOnly({})).toEqual({ ok: true, data: "ok" });
  });

  it("returns field errors from the schema", async () => {
    expect(await save({ title: "x" })).toEqual({ ok: false, error: "Please check the highlighted fields.", fieldErrors: { title: "Too short" } });
  });

  it("runs, audits with role and IP, and revalidates each path once", async () => {
    expect(await save({ title: "hello" })).toEqual({ ok: true, data: { id: "r1", by: "u1" } });
    expect(state.audits).toEqual([
      { action: "thing.saved", entityType: "thing", entityId: "r1", data: { title: "hello" }, actorId: "u1", actorRole: "user", ip: "203.0.113.9" },
    ]);
    expect(state.revalidated).toEqual(["/app/things"]);
  });

  it("maps known errors to safe messages and skips the audit", async () => {
    expect(await save({ title: "missing" })).toEqual({ ok: false, error: "Not found." });
    expect(await save({ title: "badfield" })).toEqual({ ok: false, error: "Not allowed", fieldErrors: { title: "Not allowed" } });
    expect(await save({ title: "dbguard" })).toEqual({ ok: false, error: "That change is not allowed." });
    state.limited = true;
    expect(await save({ title: "hello" })).toEqual({ ok: false, error: "Too many requests. Try again shortly." });
    expect(state.audits).toEqual([]);
  });
});
