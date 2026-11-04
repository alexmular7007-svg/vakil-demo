import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { env, features } from "@/lib/env";
import { aiConfig, type Effort, type Provider, type Tier } from "./config";
import { AiProviderError, AiUnavailableError, FairUseLimitError, isAbortedError, providerError } from "./errors";
import { CircuitBreaker, Watchdog, backoffDelay, classifyError, failure, sleep, type BreakerState, type Failure } from "./resilience";
import { logAiError } from "./safe-log";
import { estimateTokens } from "./tokens";
import { activePlanId, applyFairUse, recordUsage, todaysUsage, type BilledUsage } from "./usage";

export type { Tier, Provider };
export { AiProviderError, AiUnavailableError, FairUseLimitError, activePlanId, todaysUsage };

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type CompletionRequest = {
  /** Verified user id (for fair use and cost tracking). */
  userId: string;
  tier: Tier;
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
  /** Skip fair-use accounting (internal helper calls such as chat titles). */
  internal?: boolean;
  /** Cancels the request (e.g. the client disconnected); the provider call is aborted too. */
  signal?: AbortSignal;
};

export type CompletionResult = {
  text: string;
  provider: Provider;
  model: string;
  tier: Tier;
  tokensIn: number;
  tokensOut: number;
  refused: boolean;
  truncated: boolean;
  /** True when the request was moved to the fast model by the fair-use policy. */
  downgraded: boolean;
};

/* ----------------------------- provider selection ----------------------------- */

function pickProvider(): Provider | null {
  if (aiConfig.provider === "anthropic" && features.anthropic) return "anthropic";
  if (aiConfig.provider === "google" && features.google) return "google";
  if (features.anthropic) return "anthropic";
  if (features.google) return "google";
  return null;
}

/** Providers to try, in order: the routed one, then the other one when automatic failover applies. */
function providerOrder(): Provider[] {
  const primary = pickProvider();
  if (!primary) return [];
  const other: Provider = primary === "anthropic" ? "google" : "anthropic";
  return failoverEnabled() ? [primary, other] : [primary];
}

function failoverEnabled() {
  return aiConfig.failover && aiConfig.provider === "auto" && features.anthropic && features.google;
}

/* ----------------------------- circuit breakers ----------------------------- */

const breakers = new Map<Provider, CircuitBreaker>();

function breakerFor(provider: Provider) {
  let b = breakers.get(provider);
  if (!b) {
    b = new CircuitBreaker(aiConfig.breaker);
    breakers.set(provider, b);
  }
  return b;
}

/** Circuit state per provider on this server instance (admin view). */
export function circuitStatus(): Record<Provider, { state: BreakerState; retryInMs: number }> {
  const one = (p: Provider) => ({ state: breakers.get(p)?.state ?? "closed", retryInMs: breakers.get(p)?.retryInMs ?? 0 });
  return { anthropic: one("anthropic"), google: one("google") };
}

/** Closes every circuit (tests; an admin reset). */
export function resetCircuitBreakers() {
  breakers.clear();
}

export function aiStatus() {
  return {
    enabled: features.ai,
    anthropic: features.anthropic,
    google: features.google,
    provider: pickProvider(),
    failover: failoverEnabled(),
    circuits: circuitStatus(),
  };
}

/* ----------------------------- provider adapters ----------------------------- */

let anthropicClient: Anthropic | null = null;
let googleClient: GoogleGenAI | null = null;

function anthropic() {
  // Retries and timeouts are handled here (per attempt), not inside the SDK.
  anthropicClient ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: aiConfig.timeouts.deadlineMs });
  return anthropicClient;
}

function google() {
  // No httpOptions.retryOptions: the Gen AI SDK then makes a single attempt.
  googleClient ??= new GoogleGenAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  return googleClient;
}

/** What an attempt has been billed for so far, updated as the stream arrives. */
type LiveUsage = { billed: boolean; tokensIn: number; tokensOut: number; text: string };

type AttemptInput = {
  req: CompletionRequest;
  tier: Tier;
  model: string;
  maxTokens: number;
  effort: Effort;
  signal: AbortSignal;
  /** Any event from the provider (restarts the idle timer, marks the provider healthy). */
  onActivity: () => void;
  usage: LiveUsage;
};

type AttemptResult = Omit<CompletionResult, "provider" | "tier" | "downgraded">;

type Adapter = (a: AttemptInput) => AsyncGenerator<string, AttemptResult>;

async function* streamAnthropic(a: AttemptInput): AsyncGenerator<string, AttemptResult> {
  const supportsFallback = a.tier !== "fast"; // Haiku has no server-side refusal fallback
  const stream = anthropic().beta.messages.stream(
    {
      model: a.model,
      max_tokens: a.maxTokens,
      // Stable system prompt first; auto-caching caches the growing conversation prefix.
      system: a.req.system,
      cache_control: { type: "ephemeral" },
      output_config: { effort: a.effort },
      messages: a.req.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(supportsFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal: a.signal, maxRetries: 0 },
  );
  for await (const event of stream) {
    a.onActivity();
    if (event.type === "message_start") {
      const u = event.message.usage;
      a.usage.billed = true;
      a.usage.tokensIn = Math.max(a.usage.tokensIn, (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0));
      a.usage.tokensOut = Math.max(a.usage.tokensOut, u.output_tokens ?? 0);
    } else if (event.type === "message_delta") {
      const u = event.usage;
      a.usage.tokensOut = Math.max(a.usage.tokensOut, u.output_tokens ?? 0);
      if (u.input_tokens != null) {
        a.usage.tokensIn = Math.max(a.usage.tokensIn, u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0));
      }
    } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      a.usage.text += event.delta.text;
      yield event.delta.text;
    }
  }
  const final = await stream.finalMessage();
  const text = final.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return {
    text,
    model: final.model,
    tokensIn:
      (final.usage.input_tokens ?? 0) +
      (final.usage.cache_read_input_tokens ?? 0) +
      (final.usage.cache_creation_input_tokens ?? 0),
    tokensOut: final.usage.output_tokens ?? 0,
    refused: final.stop_reason === "refusal",
    truncated: final.stop_reason === "max_tokens",
  };
}

async function* streamGoogle(a: AttemptInput): AsyncGenerator<string, AttemptResult> {
  const stream = await google().models.generateContentStream({
    model: a.model,
    contents: a.req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    config: { systemInstruction: a.req.system, maxOutputTokens: a.maxTokens, abortSignal: a.signal },
  });
  let text = "";
  let finish: string | undefined;
  for await (const chunk of stream) {
    a.onActivity();
    a.usage.billed = true;
    if (chunk.usageMetadata) {
      const u = chunk.usageMetadata;
      a.usage.tokensIn = u.promptTokenCount ?? a.usage.tokensIn;
      // Thinking tokens are billed as output.
      a.usage.tokensOut = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) || a.usage.tokensOut;
    }
    finish = chunk.candidates?.[0]?.finishReason ?? finish;
    const t = chunk.text ?? "";
    if (t) {
      text += t;
      a.usage.text += t;
      yield t;
    }
  }
  return {
    text,
    model: a.model,
    tokensIn: a.usage.tokensIn,
    tokensOut: a.usage.tokensOut,
    refused: finish === "SAFETY" || finish === "PROHIBITED_CONTENT",
    truncated: finish === "MAX_TOKENS",
  };
}

const ADAPTERS: Record<Provider, Adapter> = { anthropic: streamAnthropic, google: streamGoogle };

/* ----------------------------- the routed call ----------------------------- */

/**
 * One completion with timeouts, retries, failover and usage accounting.
 *
 * - Each attempt has its own AbortController: it aborts when the provider is
 *   silent for AI_TIMEOUT_MS, at the overall AI_DEADLINE_MS, or when
 *   `req.signal` fires.
 * - Retryable failures (429, 5xx, overload, network, timeout) are retried with
 *   exponential backoff and jitter, but never once text has reached the caller
 *   of a stream (`buffered` callers see nothing until the end, so they can).
 * - With AI_PROVIDER=auto and both keys, a provider that keeps failing (or whose
 *   circuit is open) hands the request to the other one.
 * - Usage: every attempt the provider billed adds its tokens and cost; the
 *   request counts as one fair-use query when it answered, or when the user
 *   stopped it after text arrived.
 */
async function* run(req: CompletionRequest, buffered: boolean): AsyncGenerator<string, CompletionResult> {
  const order = providerOrder();
  if (order.length === 0) throw new AiUnavailableError();
  if (req.signal?.aborted) throw providerError("aborted");

  const cfg = aiConfig;
  const { tier, downgraded } = req.internal ? { tier: req.tier, downgraded: false } : await applyFairUse(req.userId, req.tier);
  const maxTokens = req.maxTokens ?? cfg.maxTokens[tier];
  const deadlineAt = Date.now() + cfg.timeouts.deadlineMs;

  const billed: BilledUsage[] = [];
  let promptTokens: number | null = null;
  const partial = (provider: Provider, u: LiveUsage): BilledUsage => {
    promptTokens ??= estimateTokens(req.system) + req.messages.reduce((n, m) => n + estimateTokens(m.content), 0);
    return { provider, tier, tokensIn: u.tokensIn || promptTokens, tokensOut: Math.max(u.tokensOut, estimateTokens(u.text)) };
  };

  let delivered = false;
  let outcome: "success" | "failed" | "stopped" = "stopped";
  let last: Failure | null = null;

  try {
    for (const provider of order) {
      const breaker = breakerFor(provider);
      for (let attempt = 0; ; attempt++) {
        if (!breaker.tryAcquire()) {
          last = failure("circuit_open");
          break;
        }
        const dog = new Watchdog(cfg.timeouts.idleMs, deadlineAt, req.signal);
        const usage: LiveUsage = { billed: false, tokensIn: 0, tokensOut: 0, text: "" };
        let healthy = false;
        let settled = false;
        const gen = ADAPTERS[provider]({
          req,
          tier,
          model: cfg.models[provider][tier].id,
          maxTokens,
          effort: cfg.effort[tier],
          signal: dog.signal,
          usage,
          onActivity: () => {
            dog.kick();
            if (!healthy) {
              healthy = true;
              breaker.onSuccess();
            }
          },
        });
        try {
          for (;;) {
            const step = await gen.next();
            if (step.done) {
              settled = true;
              billed.push({ provider, tier, tokensIn: step.value.tokensIn, tokensOut: step.value.tokensOut });
              outcome = "success";
              return { ...step.value, provider, tier, downgraded };
            }
            if (!buffered) {
              delivered = true;
              yield step.value;
              dog.kick(); // time spent by the consumer is not provider silence
            }
          }
        } catch (err) {
          settled = true;
          if (usage.billed) billed.push(partial(provider, usage));
          const f =
            dog.reason === "caller"
              ? failure("aborted")
              : dog.reason === "deadline"
                ? failure("deadline")
                : dog.reason === "timeout"
                  ? failure("timeout")
                  : classifyError(err);
          if (f.countsForBreaker) breaker.onFailure();
          else if (!healthy) breaker.release();
          if (f.kind === "aborted") throw providerError("aborted");
          last = f;
          logAiError("ai", "provider attempt failed", err, { provider, tier, attempt: attempt + 1, kind: f.kind, status: f.status, delivered });
          // Text already reached the user: a retry would repeat or contradict it.
          if (delivered) throw providerError(f.kind);
          if (!f.retryable || attempt >= cfg.retry.maxRetries) break;
          const delay = backoffDelay(attempt, cfg.retry, f.retryAfterMs);
          if (delay === null || Date.now() + delay >= deadlineAt) break;
          await sleep(delay, req.signal).catch(() => {
            throw providerError("aborted");
          });
        } finally {
          if (!settled) {
            // The consumer stopped reading (return() at a yield): end the provider stream, keep its billed usage.
            dog.abort("caller");
            await gen.return(undefined as never).catch(() => {});
            if (usage.billed) billed.push(partial(provider, usage));
            if (!healthy) breaker.release();
          }
          dog.dispose();
        }
      }
      if (last && !last.failover) break;
    }
    throw providerError(last?.kind ?? "unknown");
  } catch (err) {
    outcome = isAbortedError(err) ? "stopped" : "failed";
    throw err;
  } finally {
    if (!req.internal) {
      const countsAsQuery = outcome === "success" || (outcome === "stopped" && delivered);
      // A ledger hiccup must not throw away an answer that was already produced.
      await recordUsage(req.userId, billed, countsAsQuery).catch((e) => logAiError("ai", "usage ledger write failed", e));
    }
  }
}

/**
 * Streams text deltas from the routed model. The generator's return value is
 * the final CompletionResult (tokens, refusal, truncation). Usage is recorded
 * when the stream finishes, fails or is stopped (`return()` or `req.signal`).
 */
export function streamCompletion(req: CompletionRequest): AsyncGenerator<string, CompletionResult> {
  return run(req, false);
}

/** Non-streaming call (drafting, summaries, titles): may retry even after partial output. */
export async function generateCompletion(req: CompletionRequest): Promise<CompletionResult> {
  const it = run(req, true);
  for (;;) {
    const next = await it.next();
    if (next.done) return next.value;
  }
}
