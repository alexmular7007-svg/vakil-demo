import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/corpus/search", () => ({ getSection: vi.fn(async () => null) }));
vi.mock("@/lib/judgments/queries", () => ({ findJudgmentsForRefs: vi.fn(async () => new Map()) }));

import { verifyCitations } from "./citations";
import { fitHistory, fitSources, planContext, sourcePriority } from "./context";
import type { PromptSource } from "./prompts";
import type { Source } from "./retrieval";
import { estimateTokens, trimAtSentence, trimToTokens, TRIM_MARK } from "./tokens";

const sentence = (n: number) => `Sentence number ${n} explains the law in plain words.`;
const para = (count: number) => Array.from({ length: count }, (_, i) => sentence(i + 1)).join(" ");

describe("token estimate", () => {
  it("counts about four Latin characters per token and denser for Devanagari", () => {
    expect(estimateTokens("abcd".repeat(100))).toBe(100);
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("धारा".repeat(30))).toBeGreaterThan(estimateTokens("abcd".repeat(30)));
  });
});

describe("trimAtSentence", () => {
  it("returns short text unchanged", () => {
    expect(trimAtSentence("Short text.", 100)).toBe("Short text.");
  });

  it("cuts at the last full sentence that fits and marks the cut", () => {
    const out = trimAtSentence(para(10), 120);
    expect(out.endsWith(`.${TRIM_MARK}`)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(120 + TRIM_MARK.length);
    expect(out).toContain(sentence(1));
  });

  it("does not treat legal abbreviations as sentence ends", () => {
    const text =
      "The accused was charged under s. 302 IPC and the court in State v. Ram held that the Cr.P.C. applies in full. " +
      "This second sentence is long enough to be cut off at the end of the window.";
    const out = trimAtSentence(text, 150);
    expect(out).toBe(`The accused was charged under s. 302 IPC and the court in State v. Ram held that the Cr.P.C. applies in full.${TRIM_MARK}`);
  });

  it("understands the Devanagari danda", () => {
    const text = "पहला वाक्य यहाँ समाप्त होता है। दूसरा वाक्य थोड़ा लंबा है और काटा जाएगा क्योंकि जगह नहीं है।";
    expect(trimAtSentence(text, 50)).toBe(`पहला वाक्य यहाँ समाप्त होता है।${TRIM_MARK}`);
  });

  it("falls back to a word break when there is no sentence end", () => {
    const out = trimAtSentence("word ".repeat(100), 53);
    expect(out).toMatch(/word \[…\]$|word\s\[…\]$/);
    expect(out.length).toBeLessThanOrEqual(53 + TRIM_MARK.length);
  });

  it("trimToTokens fits the estimate", () => {
    const out = trimToTokens(para(40), 100);
    expect(estimateTokens(out)).toBeLessThanOrEqual(100);
    expect(out.endsWith(TRIM_MARK)).toBe(true);
  });
});

const src = (id: string, kind: PromptSource["kind"], text: string, exact = false): PromptSource => ({ id, kind, label: `${kind} ${id}`, text, exact });

describe("fitSources", () => {
  it("orders priority: exact statutes, judgments, other statutes, documents", () => {
    expect(sourcePriority(src("a", "statute", "", true))).toBeLessThan(sourcePriority(src("b", "judgment", "")));
    expect(sourcePriority(src("b", "judgment", ""))).toBeLessThan(sourcePriority(src("c", "statute", "")));
    expect(sourcePriority(src("c", "statute", ""))).toBeLessThan(sourcePriority(src("d", "document", "")));
  });

  it("keeps everything when it fits, unchanged", () => {
    const sources = [src("S1", "statute", "a"), src("S2", "judgment", "b")];
    const r = fitSources(sources, 10_000);
    expect(r.sources).toEqual(sources);
    expect(r).toMatchObject({ trimmed: 0, dropped: 0 });
  });

  it("under pressure keeps the exact statute and judgment, trims, drops documents first, and renumbers in order", () => {
    const sources = [
      src("S1", "statute", para(30), true),
      src("S2", "statute", para(30)),
      src("S3", "judgment", para(30)),
      src("S4", "document", para(30)),
    ];
    const one = estimateTokens(para(30));
    const r = fitSources(sources, Math.round(one * 2.5));
    expect(r.sources.map((s) => s.label)).toEqual(["statute S1", "statute S2", "judgment S3"]);
    expect(r.sources.map((s) => s.id)).toEqual(["S1", "S2", "S3"]);
    expect(r.sources[1].text.endsWith(TRIM_MARK)).toBe(true); // the non-exact statute was trimmed
    expect(r.sources[0].text).toBe(para(30));
    expect(r).toMatchObject({ trimmed: 1, dropped: 1 });
    expect(r.tokens).toBeLessThanOrEqual(Math.round(one * 2.5));
  });

  it("renumbers kept sources so the [S#] contract and citation check line up", async () => {
    const sources: Source[] = [src("S1", "statute", para(30)), src("S2", "judgment", para(30)), src("S3", "document", "short")].map((s) => ({
      ...s,
      href: `/x/${s.id}`,
    }));
    const one = estimateTokens(para(30));
    const r = fitSources(sources, one + 80);
    // The judgment outranks the non-exact statute; the short document still fits.
    expect(r.sources.map((s) => [s.id, s.kind])).toEqual([
      ["S1", "judgment"],
      ["S2", "document"],
    ]);
    const citations = await verifyCitations("Held [S1]; see [S2]. Not [S3].", r.sources);
    expect(citations.map((c) => [c.id, c.kind, c.status, c.href])).toEqual([
      ["S1", "judgment", "verified", "/x/S2"],
      ["S2", "document", "verified", "/x/S3"],
      ["S3", "statute", "invalid", null],
    ]);
  });
});

describe("fitHistory", () => {
  const turn = (role: "user" | "assistant", content: string) => ({ role, content });

  it("drops the oldest turns first and always starts with the user", () => {
    const h = [turn("user", para(20)), turn("assistant", para(20)), turn("user", "follow-up"), turn("assistant", "short answer")];
    const out = fitHistory(h, estimateTokens(para(20)) + 30);
    expect(out).toEqual([turn("user", "follow-up"), turn("assistant", "short answer")]);
  });

  it("removes empty messages and merges same-role neighbours", () => {
    const out = fitHistory([turn("assistant", "orphan"), turn("user", "a"), turn("user", "b"), turn("assistant", "  "), turn("assistant", "c")], 1_000);
    expect(out).toEqual([turn("user", "a\n\nb"), turn("assistant", "c")]);
  });

  it("keeps the start of a single very long last message", () => {
    const out = fitHistory([turn("user", para(200))], 200);
    expect(out).toHaveLength(1);
    expect(estimateTokens(out[0].content)).toBeLessThanOrEqual(200);
    expect(out[0].content.startsWith(sentence(1))).toBe(true);
  });
});

describe("planContext", () => {
  it("stays within the budget and always includes the question", () => {
    const plan = planContext({
      system: "System rules.",
      history: Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: para(30) })),
      question: "What does Section 106 say?",
      matterNote: "Offence date 2024-03-01.",
      sources: [src("S1", "statute", para(30), true), src("S2", "judgment", para(30)), src("S3", "document", para(30))],
      budgetTokens: 3_000,
      sourceBudgetTokens: 1_200,
    });
    expect(plan.estimatedTokens).toBeLessThanOrEqual(3_000);
    expect(plan.userTurn).toContain("What does Section 106 say?");
    expect(plan.userTurn).toContain("Offence date 2024-03-01.");
    expect(plan.sources[0]).toMatchObject({ id: "S1", kind: "statute" });
    expect(plan.history.length).toBeGreaterThan(0);
    expect(plan.history.length).toBeLessThan(20);
    expect(plan.history[0].role).toBe("user");
  });

  it("sends no sources (and says so) when the budget is used up by the fixed parts", () => {
    const plan = planContext({ system: para(100), history: [], question: "q", sources: [src("S1", "statute", para(10))], budgetTokens: 100 });
    expect(plan.sources).toEqual([]);
    expect(plan.userTurn).toMatch(/No matching sources were found/);
  });
});
