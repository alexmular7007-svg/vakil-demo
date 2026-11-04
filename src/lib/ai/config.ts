import "server-only";
import { env } from "@/lib/env";

/**
 * The one place for AI settings: model ids, tier routing, effort, output limits,
 * timeouts, retries, the circuit breaker, retrieval limits and the context budget.
 * Every value has a default here and an optional env override (declared in
 * src/lib/env.ts, documented in .env.example). Change defaults here; change a
 * deployment with env vars.
 */

export type Tier = "fast" | "standard" | "pro";
export type Provider = "anthropic" | "google";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const TIERS: readonly Tier[] = ["fast", "standard", "pro"];
export const PROVIDERS: readonly Provider[] = ["anthropic", "google"];

export type ModelSpec = {
  id: string;
  /** USD per 1M tokens, list price (used for cost tracking, not billing). */
  inputPerM: number;
  outputPerM: number;
};

export type AiConfig = {
  /** auto = Claude first, Gemini as the fallback when both keys are set. */
  provider: "auto" | Provider;
  /** Fail over to the other provider (only with provider "auto" and both keys). */
  failover: boolean;
  models: Record<Provider, Record<Tier, ModelSpec>>;
  /** Claude effort per tier: thinking depth vs. token spend. */
  effort: Record<Tier, Effort>;
  /** Default output-token ceiling per tier (a request can ask for less). */
  maxTokens: Record<Tier, number>;
  /** Which tier each kind of chat request uses. */
  routing: { chat: Tier; deep: Tier; draft: Tier; title: Tier };
  timeouts: {
    /** Abort an attempt when the provider sends nothing for this long (first response or between chunks). */
    idleMs: number;
    /** Hard cap for one completion, including retries and failover. */
    deadlineMs: number;
  };
  retry: {
    /** Retries per provider for retryable failures before any text was sent (0 = no retries). */
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  breaker: {
    /** Consecutive provider failures that open the circuit. */
    failureThreshold: number;
    /** How long an open circuit rejects requests before one probe is let through. */
    cooldownMs: number;
  };
  retrieval: {
    statuteLimit: number;
    judgmentLimit: number;
    documentLimit: number;
    /** Longest text kept per source before it is trimmed at a sentence boundary. */
    maxSourceChars: number;
  };
  context: {
    /** Estimated input tokens for the whole prompt: system, history, sources and question. */
    budgetTokens: number;
    /** Share of that budget the <sources> block may use. */
    sourceBudgetTokens: number;
    /** Earlier messages loaded as conversation history. */
    historyMessages: number;
  };
};

// Routing table. "fast" handles light work (titles, query rewriting, simple
// lookups), "standard" answers most questions, "pro" handles drafting, case
// bundles and hard analysis. Flash models are the ones Google can process in
// Mumbai (Vertex).
export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "auto",
  failover: true,
  models: {
    anthropic: {
      fast: { id: "claude-haiku-5-5", inputPerM: 0.1, outputPerM: 0.5 },
      standard: { id: "claude-sonnet-5-5", inputPerM: 2, outputPerM: 10 },
      pro: { id: "claude-opus-5-5", inputPerM: 4, outputPerM: 20 },
    },
    google: {
      fast: { id: "gemini-3.5-flash-lite", inputPerM: 0.3, outputPerM: 2.5 },
      standard: { id: "gemini-3.8-flash", inputPerM: 0.75, outputPerM: 3.75 },
      pro: { id: "gemini-3.1-pro-preview", inputPerM: 2, outputPerM: 12 },
    },
  },
  effort: { fast: "low", standard: "medium", pro: "high" },
  maxTokens: { fast: 16_000, standard: 16_000, pro: 32_000 },
  routing: { chat: "standard", deep: "pro", draft: "pro", title: "fast" },
  // The chat route may run for 300 s; the deadline leaves room for retrieval and saving.
  timeouts: { idleMs: 90_000, deadlineMs: 270_000 },
  retry: { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 8_000 },
  breaker: { failureThreshold: 5, cooldownMs: 30_000 },
  retrieval: { statuteLimit: 6, judgmentLimit: 4, documentLimit: 4, maxSourceChars: 2_400 },
  context: { budgetTokens: 48_000, sourceBudgetTokens: 12_000, historyMessages: 20 },
};

/** Every env var the AI config reads (documented in .env.example). */
export const AI_ENV_KEYS = [
  "AI_PROVIDER",
  "AI_FAILOVER",
  "AI_MODEL_CLAUDE_FAST",
  "AI_MODEL_CLAUDE_STANDARD",
  "AI_MODEL_CLAUDE_PRO",
  "AI_MODEL_GEMINI_FAST",
  "AI_MODEL_GEMINI_STANDARD",
  "AI_MODEL_GEMINI_PRO",
  "GEMINI_FAST_MODEL",
  "GEMINI_STANDARD_MODEL",
  "GEMINI_PRO_MODEL",
  "AI_EFFORT_FAST",
  "AI_EFFORT_STANDARD",
  "AI_EFFORT_PRO",
  "AI_MAX_TOKENS_FAST",
  "AI_MAX_TOKENS_STANDARD",
  "AI_MAX_TOKENS_PRO",
  "AI_TIER_CHAT",
  "AI_TIER_DEEP",
  "AI_TIER_DRAFT",
  "AI_TIER_TITLE",
  "AI_TIMEOUT_MS",
  "AI_DEADLINE_MS",
  "AI_MAX_RETRIES",
  "AI_RETRY_BASE_MS",
  "AI_RETRY_MAX_MS",
  "AI_BREAKER_THRESHOLD",
  "AI_BREAKER_COOLDOWN_MS",
  "AI_RETRIEVAL_STATUTES",
  "AI_RETRIEVAL_JUDGMENTS",
  "AI_RETRIEVAL_DOCUMENTS",
  "AI_SOURCE_MAX_CHARS",
  "AI_CONTEXT_BUDGET_TOKENS",
  "AI_SOURCE_BUDGET_TOKENS",
  "AI_HISTORY_MESSAGES",
] as const;

/** The validated env values the AI config reads (all optional). */
export type AiEnv = Partial<Pick<typeof env, (typeof AI_ENV_KEYS)[number]>>;

/** Builds the config from defaults plus validated env overrides. Pure, so tests can call it. */
export function buildAiConfig(e: AiEnv = {}, base: AiConfig = DEFAULT_AI_CONFIG): AiConfig {
  const model = (spec: ModelSpec, ...ids: (string | undefined)[]): ModelSpec => {
    const id = ids.find((v) => v && v.trim());
    return id ? { ...spec, id: id.trim() } : spec;
  };
  const m = base.models;

  const retryBase = e.AI_RETRY_BASE_MS ?? base.retry.baseDelayMs;
  const contextBudget = e.AI_CONTEXT_BUDGET_TOKENS ?? base.context.budgetTokens;

  return {
    provider: e.AI_PROVIDER ?? base.provider,
    failover: e.AI_FAILOVER ? e.AI_FAILOVER === "true" : base.failover,
    models: {
      anthropic: {
        fast: model(m.anthropic.fast, e.AI_MODEL_CLAUDE_FAST),
        standard: model(m.anthropic.standard, e.AI_MODEL_CLAUDE_STANDARD),
        pro: model(m.anthropic.pro, e.AI_MODEL_CLAUDE_PRO),
      },
      google: {
        fast: model(m.google.fast, e.AI_MODEL_GEMINI_FAST, e.GEMINI_FAST_MODEL),
        standard: model(m.google.standard, e.AI_MODEL_GEMINI_STANDARD, e.GEMINI_STANDARD_MODEL),
        pro: model(m.google.pro, e.AI_MODEL_GEMINI_PRO, e.GEMINI_PRO_MODEL),
      },
    },
    effort: {
      fast: e.AI_EFFORT_FAST ?? base.effort.fast,
      standard: e.AI_EFFORT_STANDARD ?? base.effort.standard,
      pro: e.AI_EFFORT_PRO ?? base.effort.pro,
    },
    maxTokens: {
      fast: e.AI_MAX_TOKENS_FAST ?? base.maxTokens.fast,
      standard: e.AI_MAX_TOKENS_STANDARD ?? base.maxTokens.standard,
      pro: e.AI_MAX_TOKENS_PRO ?? base.maxTokens.pro,
    },
    routing: {
      chat: e.AI_TIER_CHAT ?? base.routing.chat,
      deep: e.AI_TIER_DEEP ?? base.routing.deep,
      draft: e.AI_TIER_DRAFT ?? base.routing.draft,
      title: e.AI_TIER_TITLE ?? base.routing.title,
    },
    timeouts: {
      idleMs: e.AI_TIMEOUT_MS ?? base.timeouts.idleMs,
      deadlineMs: e.AI_DEADLINE_MS ?? base.timeouts.deadlineMs,
    },
    retry: {
      maxRetries: e.AI_MAX_RETRIES ?? base.retry.maxRetries,
      baseDelayMs: retryBase,
      // A ceiling below the base delay would make backoff meaningless.
      maxDelayMs: Math.max(retryBase, e.AI_RETRY_MAX_MS ?? base.retry.maxDelayMs),
    },
    breaker: {
      failureThreshold: e.AI_BREAKER_THRESHOLD ?? base.breaker.failureThreshold,
      cooldownMs: e.AI_BREAKER_COOLDOWN_MS ?? base.breaker.cooldownMs,
    },
    retrieval: {
      statuteLimit: e.AI_RETRIEVAL_STATUTES ?? base.retrieval.statuteLimit,
      judgmentLimit: e.AI_RETRIEVAL_JUDGMENTS ?? base.retrieval.judgmentLimit,
      documentLimit: e.AI_RETRIEVAL_DOCUMENTS ?? base.retrieval.documentLimit,
      maxSourceChars: e.AI_SOURCE_MAX_CHARS ?? base.retrieval.maxSourceChars,
    },
    context: {
      budgetTokens: contextBudget,
      // Sources can never take more than the whole prompt budget.
      sourceBudgetTokens: Math.min(contextBudget, e.AI_SOURCE_BUDGET_TOKENS ?? base.context.sourceBudgetTokens),
      historyMessages: e.AI_HISTORY_MESSAGES ?? base.context.historyMessages,
    },
  };
}

/** The live configuration for this server process. */
export const aiConfig: AiConfig = buildAiConfig(env);

/** Tier for a chat request: deep analysis and drafting go up, a "fast" custom assistant goes down. */
export function chatTier(
  opts: { deep: boolean; mode: "research" | "draft" | "explain"; assistantTier?: string | null },
  cfg: AiConfig = aiConfig,
): Tier {
  if (opts.deep) return cfg.routing.deep;
  if (opts.mode === "draft") return cfg.routing.draft;
  if (opts.assistantTier === "fast") return "fast";
  return cfg.routing.chat;
}

/** Estimated cost in micro-dollars (USD × 1e6) for tokens on a provider's tier. */
export function costMicros(provider: Provider, tier: Tier, tokensIn: number, tokensOut: number, cfg: AiConfig = aiConfig) {
  const m = cfg.models[provider][tier];
  return Math.round(tokensIn * m.inputPerM + tokensOut * m.outputPerM);
}
