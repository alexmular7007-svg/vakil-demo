import "server-only";
import { aiConfig } from "./config";
import type { ChatTurn } from "./gateway";
import { buildUserTurn, formatSource, type PromptSource } from "./prompts";
import { estimateTokens, trimToTokens, TRIM_MARK } from "./tokens";

/** Sources shorter than this after trimming are dropped rather than sent as a stub. */
const MIN_SOURCE_TOKENS = 80;
/** Per-message overhead the providers add (role markers etc.). */
const TURN_OVERHEAD = 8;

/** Lower is kept first: exact statute matches, then judgments, then other statutes, then documents. */
export function sourcePriority(s: PromptSource): number {
  if (s.kind === "statute") return s.exact ? 0 : 2;
  if (s.kind === "judgment") return s.exact ? 1 : 1.5;
  return 3;
}

/**
 * Keeps the most important sources within `budgetTokens` (estimated, including
 * the delimiters): whole sources in priority order, then the next one trimmed at
 * a sentence boundary if a useful part fits. The kept sources stay in retrieval
 * order and are renumbered S1, S2 … so the prompt, the [S#] markers in the
 * answer and the citation check all use the same numbers.
 */
export function fitSources<T extends PromptSource>(
  sources: T[],
  budgetTokens: number,
): { sources: T[]; trimmed: number; dropped: number; tokens: number } {
  const order = sources.map((s, i) => ({ s, i })).sort((a, b) => sourcePriority(a.s) - sourcePriority(b.s) || a.i - b.i);
  const kept = new Map<number, T>();
  let left = budgetTokens;
  let trimmed = 0;
  for (const { s, i } of order) {
    const cost = estimateTokens(formatSource(s));
    if (cost <= left) {
      kept.set(i, s);
      left -= cost;
      continue;
    }
    const frame = cost - estimateTokens(s.text);
    const room = left - frame;
    if (room < MIN_SOURCE_TOKENS) continue;
    const text = trimToTokens(s.text, room);
    if (!text || estimateTokens(text) < MIN_SOURCE_TOKENS / 2) continue;
    const short = { ...s, text: text.endsWith(TRIM_MARK) ? text : `${text}${TRIM_MARK}` };
    const shortCost = estimateTokens(formatSource(short));
    if (shortCost > left) continue;
    kept.set(i, short);
    left -= shortCost;
    trimmed++;
  }
  const out = [...kept.entries()].sort((a, b) => a[0] - b[0]).map(([, s], n) => ({ ...s, id: `S${n + 1}` }));
  return { sources: out, trimmed, dropped: sources.length - out.length, tokens: budgetTokens - left };
}

/**
 * Conversation history within `budgetTokens`: newest messages first, oldest
 * dropped; empty messages removed and same-role neighbours merged (providers
 * expect alternating turns); it always starts with a user turn. If even the
 * newest message is too long, its beginning is kept.
 */
export function fitHistory(history: ChatTurn[], budgetTokens: number): ChatTurn[] {
  const clean: ChatTurn[] = [];
  for (const t of history) {
    const content = t.content.trim();
    if (!content) continue;
    const last = clean[clean.length - 1];
    if (last && last.role === t.role) last.content = `${last.content}\n\n${content}`;
    else clean.push({ role: t.role, content });
  }
  const out: ChatTurn[] = [];
  let left = budgetTokens;
  for (let i = clean.length - 1; i >= 0; i--) {
    const cost = estimateTokens(clean[i].content) + TURN_OVERHEAD;
    if (cost <= left) {
      out.unshift(clean[i]);
      left -= cost;
      continue;
    }
    if (out.length === 0 && left - TURN_OVERHEAD >= MIN_SOURCE_TOKENS) {
      const text = trimToTokens(clean[i].content, left - TURN_OVERHEAD);
      if (text) out.unshift({ role: clean[i].role, content: text });
    }
    break;
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export type ContextPlan<T extends PromptSource> = {
  /** Sources that made it into the prompt, renumbered S1 … (use these for citation checks too). */
  sources: T[];
  history: ChatTurn[];
  /** The final user turn: sources, matter note and question. */
  userTurn: string;
  estimatedTokens: number;
  trimmedSources: number;
  droppedSources: number;
  droppedHistory: number;
};

/**
 * Fits one chat request into the context budget. The system prompt, question
 * and matter note always go in; sources get up to the source budget; history
 * gets what is left, newest first.
 */
export function planContext<T extends PromptSource>(opts: {
  system: string;
  history: ChatTurn[];
  question: string;
  matterNote?: string | null;
  sources: T[];
  budgetTokens?: number;
  sourceBudgetTokens?: number;
}): ContextPlan<T> {
  const budget = opts.budgetTokens ?? aiConfig.context.budgetTokens;
  const sourceCap = Math.min(budget, opts.sourceBudgetTokens ?? aiConfig.context.sourceBudgetTokens);
  const fixed =
    estimateTokens(opts.system) + estimateTokens(buildUserTurn({ question: opts.question, sources: [], matterNote: opts.matterNote })) + TURN_OVERHEAD;
  const available = Math.max(0, budget - fixed);

  const fitted = fitSources(opts.sources, Math.min(sourceCap, available));
  const userTurn = buildUserTurn({ question: opts.question, sources: fitted.sources, matterNote: opts.matterNote });
  const turnTokens = estimateTokens(userTurn) + TURN_OVERHEAD;
  const history = fitHistory(opts.history, Math.max(0, budget - estimateTokens(opts.system) - turnTokens));
  const historyTokens = history.reduce((n, t) => n + estimateTokens(t.content) + TURN_OVERHEAD, 0);

  return {
    sources: fitted.sources,
    history,
    userTurn,
    estimatedTokens: estimateTokens(opts.system) + turnTokens + historyTokens,
    trimmedSources: fitted.trimmed,
    droppedSources: fitted.dropped,
    droppedHistory: Math.max(0, opts.history.filter((t) => t.content.trim()).length - history.length),
  };
}
