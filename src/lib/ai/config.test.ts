import { describe, expect, it } from "vitest";
import { buildAiConfig, chatTier, costMicros, DEFAULT_AI_CONFIG } from "./config";
import { EFFORT, MODELS } from "./models";

describe("AI config", () => {
  it("keeps the current models and settings as defaults", () => {
    const c = buildAiConfig({});
    expect(c.models.anthropic.fast.id).toBe("claude-haiku-5-5");
    expect(c.models.anthropic.standard.id).toBe("claude-sonnet-5-5");
    expect(c.models.anthropic.pro.id).toBe("claude-opus-5-5");
    expect(c.models.google.fast.id).toBe("gemini-3.5-flash-lite");
    expect(c.models.google.standard.id).toBe("gemini-3.8-flash");
    expect(c.models.google.pro.id).toBe("gemini-3.1-pro-preview");
    expect(c.effort).toEqual({ fast: "low", standard: "medium", pro: "high" });
    expect(c.maxTokens).toEqual({ fast: 16_000, standard: 16_000, pro: 32_000 });
    expect(c.retrieval).toEqual({ statuteLimit: 6, judgmentLimit: 4, documentLimit: 4, maxSourceChars: 2_400 });
    expect(c).toEqual(DEFAULT_AI_CONFIG);
  });

  it("applies env overrides for models, effort, tokens, routing, resilience and retrieval", () => {
    const c = buildAiConfig({
      AI_PROVIDER: "google",
      AI_FAILOVER: "false",
      AI_MODEL_CLAUDE_STANDARD: "claude-sonnet-next",
      AI_MODEL_GEMINI_FAST: "gemini-fast-next",
      AI_EFFORT_PRO: "max",
      AI_MAX_TOKENS_STANDARD: 8_000,
      AI_TIER_DRAFT: "standard",
      AI_TIMEOUT_MS: 30_000,
      AI_DEADLINE_MS: 120_000,
      AI_MAX_RETRIES: 4,
      AI_BREAKER_THRESHOLD: 3,
      AI_BREAKER_COOLDOWN_MS: 10_000,
      AI_RETRIEVAL_JUDGMENTS: 8,
      AI_SOURCE_MAX_CHARS: 1_200,
      AI_CONTEXT_BUDGET_TOKENS: 20_000,
      AI_HISTORY_MESSAGES: 6,
    });
    expect(c.provider).toBe("google");
    expect(c.failover).toBe(false);
    expect(c.models.anthropic.standard).toEqual({ id: "claude-sonnet-next", inputPerM: 2, outputPerM: 10 });
    expect(c.models.anthropic.fast.id).toBe("claude-haiku-5-5");
    expect(c.models.google.fast.id).toBe("gemini-fast-next");
    expect(c.effort.pro).toBe("max");
    expect(c.maxTokens.standard).toBe(8_000);
    expect(c.routing.draft).toBe("standard");
    expect(c.timeouts).toEqual({ idleMs: 30_000, deadlineMs: 120_000 });
    expect(c.retry.maxRetries).toBe(4);
    expect(c.breaker).toEqual({ failureThreshold: 3, cooldownMs: 10_000 });
    expect(c.retrieval.judgmentLimit).toBe(8);
    expect(c.retrieval.maxSourceChars).toBe(1_200);
    expect(c.context.budgetTokens).toBe(20_000);
    expect(c.context.historyMessages).toBe(6);
  });

  it("still honours the older GEMINI_*_MODEL names, after the new ones", () => {
    expect(buildAiConfig({ GEMINI_PRO_MODEL: "gemini-old-name" }).models.google.pro.id).toBe("gemini-old-name");
    expect(buildAiConfig({ GEMINI_PRO_MODEL: "old", AI_MODEL_GEMINI_PRO: "new" }).models.google.pro.id).toBe("new");
  });

  it("keeps dependent limits consistent", () => {
    const c = buildAiConfig({ AI_RETRY_BASE_MS: 2_000, AI_RETRY_MAX_MS: 100, AI_CONTEXT_BUDGET_TOKENS: 4_000, AI_SOURCE_BUDGET_TOKENS: 9_000 });
    expect(c.retry.maxDelayMs).toBe(2_000);
    expect(c.context.sourceBudgetTokens).toBe(4_000);
  });

  it("routes chat requests to tiers", () => {
    const cfg = buildAiConfig({});
    expect(chatTier({ deep: false, mode: "research" }, cfg)).toBe("standard");
    expect(chatTier({ deep: true, mode: "research" }, cfg)).toBe("pro");
    expect(chatTier({ deep: false, mode: "draft" }, cfg)).toBe("pro");
    expect(chatTier({ deep: false, mode: "explain", assistantTier: "fast" }, cfg)).toBe("fast");
    expect(chatTier({ deep: false, mode: "research" }, buildAiConfig({ AI_TIER_CHAT: "fast" }))).toBe("fast");
  });

  it("prices tokens from the routing table and keeps the old exports", () => {
    expect(costMicros("anthropic", "standard", 1_000, 100, buildAiConfig({}))).toBe(3_000);
    expect(MODELS.anthropic.pro.id).toBe("claude-opus-5-5");
    expect(EFFORT.standard).toBe("medium");
  });
});
