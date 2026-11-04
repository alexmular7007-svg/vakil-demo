import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No live provider calls: both SDK clients are replaced by scripted fakes, the
// real SDK error classes are kept so classification is tested for real.
const h = vi.hoisted(() => ({ claude: vi.fn(), gemini: vi.fn() }));

vi.mock("@anthropic-ai/sdk", async (orig) => {
  const actual = await orig<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    beta = { messages: { stream: h.claude } };
  }
  return { ...actual, default: FakeAnthropic };
});

vi.mock("@google/genai", async (orig) => {
  const actual = await orig<typeof import("@google/genai")>();
  class FakeGoogleGenAI {
    models = { generateContentStream: h.gemini };
  }
  return { ...actual, GoogleGenAI: FakeGoogleGenAI };
});

vi.mock("@/lib/env", () => ({
  env: { ANTHROPIC_API_KEY: "test-anthropic", GOOGLE_GENERATIVE_AI_API_KEY: "test-google", AI_PROVIDER: "auto" },
  features: { ai: true, anthropic: true, google: true },
}));

vi.mock("./usage", () => ({
  applyFairUse: vi.fn(async (_userId: string, tier: string) => ({ tier, downgraded: false })),
  recordUsage: vi.fn(async () => {}),
  activePlanId: vi.fn(async () => "free"),
  todaysUsage: vi.fn(async () => 0),
}));

import { APIUserAbortError, AuthenticationError, InternalServerError, RateLimitError } from "@anthropic-ai/sdk";
import { features } from "@/lib/env";
import { aiConfig, DEFAULT_AI_CONFIG } from "./config";
import { isAbortedError } from "./errors";
import {
  AiProviderError,
  AiUnavailableError,
  circuitStatus,
  FairUseLimitError,
  generateCompletion,
  resetCircuitBreakers,
  streamCompletion,
  type CompletionRequest,
} from "./gateway";
import { applyFairUse, recordUsage } from "./usage";

/* ----------------------------- scripted providers ----------------------------- */

type ClaudeScript = {
  text?: string[];
  /** Thrown before message_start, or before delta `failAt` when that is set. */
  error?: unknown;
  failAt?: number;
  /** Waits until the request is aborted, at the start or before delta n. */
  hangAt?: "start" | number;
  stop?: string;
};

type StreamOpts = { signal: AbortSignal; maxRetries: number };

function waitForAbort(signal: AbortSignal) {
  return new Promise<never>((_, reject) => {
    const fail = () => reject(new APIUserAbortError());
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
}

function claude(s: ClaudeScript = {}) {
  return (params: { model: string }, opts: StreamOpts) => {
    const text = s.text ?? ["Claude ", "answer"];
    const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    return {
      async *[Symbol.asyncIterator]() {
        if (s.hangAt === "start") await waitForAbort(opts.signal);
        if (s.error && s.failAt === undefined) throw s.error;
        yield { type: "message_start", message: { model: params.model, usage: { ...usage, output_tokens: 1 } } };
        for (let i = 0; i <= text.length; i++) {
          if (s.error && s.failAt === i) throw s.error;
          if (s.hangAt === i) await waitForAbort(opts.signal);
          if (i < text.length) yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text[i] } };
        }
        yield { type: "message_delta", usage: { output_tokens: 20 }, delta: { stop_reason: s.stop ?? "end_turn" } };
      },
      finalMessage: async () => ({
        model: params.model,
        content: [{ type: "text", text: text.join("") }],
        usage,
        stop_reason: s.stop ?? "end_turn",
      }),
    };
  };
}

function gemini(text = ["Gemini ", "answer"]) {
  return async () =>
    (async function* () {
      for (const t of text) {
        yield { text: t, usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10, thoughtsTokenCount: 5 }, candidates: [{}] };
      }
      yield { text: "", usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 12, thoughtsTokenCount: 5 }, candidates: [{ finishReason: "STOP" }] };
    })();
}

const overloaded = () => new InternalServerError(529, { type: "error", error: { type: "overloaded_error" } }, "Overloaded", new Headers());
const serverError = () => new InternalServerError(503, {}, "Service unavailable", new Headers());

const req = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  userId: "user-1",
  tier: "standard",
  system: "SYSTEM PROMPT SECRET",
  messages: [{ role: "user", content: "PRIVATE QUESTION about my client" }],
  ...over,
});

async function drain(it: AsyncGenerator<string, unknown>) {
  const deltas: string[] = [];
  for (;;) {
    const n = await it.next();
    if (n.done) return { deltas, result: n.value };
    deltas.push(n.value);
  }
}

const usageCall = () => vi.mocked(recordUsage).mock.calls.at(-1);

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.claude.mockReset();
  h.gemini.mockReset();
  vi.mocked(recordUsage).mockClear();
  vi.mocked(applyFairUse).mockClear();
  Object.assign(aiConfig, structuredClone(DEFAULT_AI_CONFIG), {
    timeouts: { idleMs: 500, deadlineMs: 5_000 },
    retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 },
    breaker: { failureThreshold: 3, cooldownMs: 60_000 },
  });
  Object.assign(features, { ai: true, anthropic: true, google: true });
  resetCircuitBreakers();
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Logs never carry the system prompt, the question or answer text.
  for (const call of errorLog.mock.calls) {
    const line = call.map(String).join(" ");
    expect(line).not.toMatch(/SYSTEM PROMPT|PRIVATE QUESTION|Part one|Claude answer/);
  }
  errorLog.mockRestore();
});

/* ----------------------------- tests ----------------------------- */

describe("gateway: happy path and accounting", () => {
  it("streams Claude text with the configured model, effort and limits, and records one query", async () => {
    h.claude.mockImplementation(claude());
    const { deltas, result } = await drain(streamCompletion(req()));
    expect(deltas).toEqual(["Claude ", "answer"]);
    expect(result).toMatchObject({ text: "Claude answer", provider: "anthropic", model: "claude-sonnet-5-5", tier: "standard", refused: false });

    const [params, opts] = h.claude.mock.calls[0];
    expect(params).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 16_000, output_config: { effort: "medium" }, system: "SYSTEM PROMPT SECRET" });
    expect(opts.maxRetries).toBe(0);
    expect(opts.signal).toBeInstanceOf(AbortSignal);

    expect(usageCall()).toEqual(["user-1", [{ provider: "anthropic", tier: "standard", tokensIn: 100, tokensOut: 20 }], true]);
    expect(h.gemini).not.toHaveBeenCalled();
  });

  it("uses model ids and effort changed in the config", async () => {
    aiConfig.models.anthropic.pro = { ...aiConfig.models.anthropic.pro, id: "claude-opus-override" };
    aiConfig.effort.pro = "max";
    h.claude.mockImplementation(claude());
    const r = await generateCompletion(req({ tier: "pro" }));
    expect(r.model).toBe("claude-opus-override");
    expect(h.claude.mock.calls[0][0]).toMatchObject({ model: "claude-opus-override", max_tokens: 32_000, output_config: { effort: "max" } });
  });

  it("passes the fair-use refusal through before any provider call", async () => {
    vi.mocked(applyFairUse).mockRejectedValueOnce(new FairUseLimitError(15));
    await expect(generateCompletion(req())).rejects.toBeInstanceOf(FairUseLimitError);
    expect(h.claude).not.toHaveBeenCalled();
  });

  it("skips fair use and the ledger for internal calls", async () => {
    h.claude.mockImplementation(claude());
    await generateCompletion(req({ internal: true, tier: "fast" }));
    expect(applyFairUse).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("reports the downgrade from the fair-use policy", async () => {
    vi.mocked(applyFairUse).mockResolvedValueOnce({ tier: "fast", downgraded: true });
    h.claude.mockImplementation(claude());
    const r = await generateCompletion(req());
    expect(r).toMatchObject({ tier: "fast", downgraded: true, model: "claude-haiku-5-5" });
  });

  it("throws AiUnavailableError without keys", async () => {
    Object.assign(features, { ai: false, anthropic: false, google: false });
    await expect(generateCompletion(req())).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe("gateway: retries", () => {
  it("retries an overloaded provider at stream start, and unbilled failed attempts cost nothing", async () => {
    h.claude.mockImplementationOnce(claude({ error: overloaded() })).mockImplementationOnce(claude({ error: serverError() })).mockImplementation(claude());
    const { deltas, result } = await drain(streamCompletion(req()));
    expect(deltas.join("")).toBe("Claude answer");
    expect(result).toMatchObject({ provider: "anthropic" });
    expect(h.claude).toHaveBeenCalledTimes(3);
    expect(usageCall()?.[1]).toHaveLength(1);
    expect(usageCall()?.[2]).toBe(true);
  });

  it("never retries once text reached the caller; the billed partial attempt is recorded, not counted as a query", async () => {
    h.claude.mockImplementation(claude({ text: ["Part one", " never"], error: serverError(), failAt: 1 }));
    const it = streamCompletion(req());
    expect((await it.next()).value).toBe("Part one");
    const err = await it.next().catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({ kind: "server", retryable: true });
    expect(h.claude).toHaveBeenCalledTimes(1);
    expect(h.gemini).not.toHaveBeenCalled(); // no failover after text either
    const [, billed, counted] = usageCall()!;
    expect(counted).toBe(false);
    expect(billed).toEqual([{ provider: "anthropic", tier: "standard", tokensIn: 100, tokensOut: expect.any(Number) }]);
    expect(billed[0].tokensOut).toBeGreaterThanOrEqual(1);
  });

  it("generateCompletion may retry after partial output (nothing was shown) and bills both attempts", async () => {
    h.claude.mockImplementationOnce(claude({ text: ["abc", "def"], error: serverError(), failAt: 1 })).mockImplementation(claude());
    const r = await generateCompletion(req());
    expect(r.text).toBe("Claude answer");
    expect(h.claude).toHaveBeenCalledTimes(2);
    const [, billed, counted] = usageCall()!;
    expect(billed).toHaveLength(2);
    expect(counted).toBe(true);
  });

  it("does not retry a rejected request on the same provider", async () => {
    aiConfig.provider = "anthropic"; // pinned: no failover
    h.claude.mockImplementation(claude({ error: new AuthenticationError(401, {}, "bad key", new Headers()) }));
    await expect(generateCompletion(req())).rejects.toMatchObject({ kind: "auth", retryable: false });
    expect(h.claude).toHaveBeenCalledTimes(1);
  });

  it("aborts a silent provider after the idle timeout and retries", async () => {
    aiConfig.provider = "anthropic";
    aiConfig.timeouts.idleMs = 30;
    aiConfig.retry.maxRetries = 1;
    h.claude.mockImplementation(claude({ hangAt: "start" }));
    const err = await generateCompletion(req()).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({ kind: "timeout", message: expect.stringMatching(/took too long/) });
    expect(h.claude).toHaveBeenCalledTimes(2);
    expect(h.claude.mock.calls.every(([, o]) => (o as StreamOpts).signal.aborted)).toBe(true);
  });

  it("stops at the overall deadline without failing over", async () => {
    aiConfig.timeouts = { idleMs: 5_000, deadlineMs: 40 };
    h.claude.mockImplementation(claude({ hangAt: "start" }));
    await expect(generateCompletion(req())).rejects.toMatchObject({ kind: "deadline" });
    expect(h.gemini).not.toHaveBeenCalled();
  });
});

describe("gateway: failover", () => {
  it("hands the request to Gemini when Claude keeps failing", async () => {
    h.claude.mockImplementation(claude({ error: serverError() }));
    h.gemini.mockImplementation(gemini());
    const r = await generateCompletion(req({ messages: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }, { role: "user", content: "q2" }] }));
    expect(h.claude).toHaveBeenCalledTimes(3); // 1 + 2 retries
    expect(r).toMatchObject({ provider: "google", model: "gemini-3.8-flash", text: "Gemini answer", tokensIn: 50, tokensOut: 17 });
    const call = h.gemini.mock.calls[0][0];
    expect(call.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
    expect(call.config).toMatchObject({ systemInstruction: "SYSTEM PROMPT SECRET", maxOutputTokens: 16_000 });
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(usageCall()).toEqual(["user-1", [{ provider: "google", tier: "standard", tokensIn: 50, tokensOut: 17 }], true]);
  });

  it("fails over at once on a rejected key, and when retry-after exceeds the backoff cap", async () => {
    h.claude.mockImplementationOnce(claude({ error: new AuthenticationError(401, {}, "bad key", new Headers()) }));
    h.gemini.mockImplementation(gemini());
    expect((await generateCompletion(req())).provider).toBe("google");
    expect(h.claude).toHaveBeenCalledTimes(1);

    h.claude.mockImplementationOnce(claude({ error: new RateLimitError(429, {}, "slow", new Headers({ "retry-after": "60" })) }));
    expect((await generateCompletion(req())).provider).toBe("google");
    expect(h.claude).toHaveBeenCalledTimes(2);
  });

  it("does not fail over when the provider is pinned or failover is off", async () => {
    h.claude.mockImplementation(claude({ error: serverError() }));
    h.gemini.mockImplementation(gemini());
    aiConfig.provider = "anthropic";
    await expect(generateCompletion(req())).rejects.toMatchObject({ kind: "server", retryable: true });
    aiConfig.provider = "auto";
    aiConfig.failover = false;
    await expect(generateCompletion(req())).rejects.toBeInstanceOf(AiProviderError);
    expect(h.gemini).not.toHaveBeenCalled();
  });

  it("does not fail over without the second key", async () => {
    features.google = false;
    h.claude.mockImplementation(claude({ error: serverError() }));
    await expect(generateCompletion(req())).rejects.toBeInstanceOf(AiProviderError);
    expect(h.gemini).not.toHaveBeenCalled();
  });

  it("never fails over a refusal", async () => {
    h.claude.mockImplementation(claude({ text: [], stop: "refusal" }));
    h.gemini.mockImplementation(gemini());
    const r = await generateCompletion(req());
    expect(r).toMatchObject({ refused: true, provider: "anthropic" });
    expect(h.gemini).not.toHaveBeenCalled();
  });
});

describe("gateway: circuit breaker", () => {
  it("opens after repeated failures, skips the provider, then lets one probe close it", async () => {
    aiConfig.breaker = { failureThreshold: 3, cooldownMs: 40 };
    h.claude.mockImplementation(claude({ error: serverError() }));
    h.gemini.mockImplementation(gemini());

    expect((await generateCompletion(req())).provider).toBe("google");
    expect(h.claude).toHaveBeenCalledTimes(3);
    expect(circuitStatus().anthropic.state).toBe("open");

    // Open: Claude is not even tried.
    expect((await generateCompletion(req())).provider).toBe("google");
    expect(h.claude).toHaveBeenCalledTimes(3);

    // After the cool-down one probe goes through; it succeeds and closes the circuit.
    await new Promise((r) => setTimeout(r, 50));
    h.claude.mockImplementation(claude());
    expect((await generateCompletion(req())).provider).toBe("anthropic");
    expect(h.claude).toHaveBeenCalledTimes(4);
    expect(circuitStatus().anthropic.state).toBe("closed");
  });

  it("rejects fast with a clear message when the only provider's circuit is open", async () => {
    aiConfig.provider = "anthropic";
    aiConfig.retry.maxRetries = 0;
    aiConfig.breaker = { failureThreshold: 1, cooldownMs: 60_000 };
    h.claude.mockImplementation(claude({ error: serverError() }));
    await expect(generateCompletion(req())).rejects.toMatchObject({ kind: "server" });
    await expect(generateCompletion(req())).rejects.toMatchObject({ kind: "circuit_open", message: expect.stringMatching(/temporarily unavailable/) });
    expect(h.claude).toHaveBeenCalledTimes(1);
  });

  it("does not count rejected requests (400) against the provider", async () => {
    aiConfig.provider = "anthropic";
    aiConfig.breaker = { failureThreshold: 1, cooldownMs: 60_000 };
    const { BadRequestError } = await import("@anthropic-ai/sdk");
    h.claude.mockImplementation(claude({ error: new BadRequestError(400, {}, "bad", new Headers()) }));
    await expect(generateCompletion(req())).rejects.toMatchObject({ kind: "bad_request" });
    expect(circuitStatus().anthropic.state).toBe("closed");
  });
});

describe("gateway: cancellation", () => {
  it("stops when the caller aborts: no retry or failover; the usage so far counts as a query", async () => {
    h.claude.mockImplementation(claude({ text: ["one ", "two "], hangAt: 1 }));
    h.gemini.mockImplementation(gemini());
    const ac = new AbortController();
    const it = streamCompletion(req({ signal: ac.signal }));
    expect((await it.next()).value).toBe("one ");
    const pending = it.next();
    ac.abort();
    const err = await pending.catch((e) => e);
    expect(isAbortedError(err)).toBe(true);
    expect(h.claude).toHaveBeenCalledTimes(1);
    expect(h.gemini).not.toHaveBeenCalled();
    const [, billed, counted] = usageCall()!;
    expect(counted).toBe(true);
    expect(billed).toHaveLength(1);
  });

  it("an already-aborted request never reaches the provider", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(generateCompletion(req({ signal: ac.signal }))).rejects.toSatisfy(isAbortedError);
    expect(h.claude).not.toHaveBeenCalled();
  });

  it("a consumer that stops reading ends the provider stream and records the usage", async () => {
    h.claude.mockImplementation(claude({ text: ["one ", "two ", "three"] }));
    const it = streamCompletion(req());
    await it.next();
    await it.return(undefined as never);
    const [, opts] = h.claude.mock.calls[0];
    expect((opts as StreamOpts).signal.aborted).toBe(true);
    const [, billed, counted] = usageCall()!;
    expect(counted).toBe(true);
    expect(billed[0]).toMatchObject({ provider: "anthropic", tokensIn: 100 });
  });
});
