import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { documentChunks, documents } from "@/lib/db/schema";
import { governingCriminalCode, searchStatutesMarked } from "@/lib/corpus/search";
import { judgmentLabel, pickParagraphs } from "@/lib/judgments/cite";
import { judgmentCandidates } from "@/lib/judgments/queries";
import { aiConfig } from "./config";
import type { PromptSource } from "./prompts";
import { logAiError } from "./safe-log";
import { trimAtSentence } from "./tokens";

export type Source = PromptSource & {
  /** In-app link for the source card. */
  href: string | null;
  meta?: { actId?: string; sectionNo?: string; documentId?: string; judgmentId?: string; paraNo?: number };
};

/** Long passages are cut at a sentence boundary (AI_SOURCE_MAX_CHARS). */
function clip(text: string) {
  return trimAtSentence(text, aiConfig.retrieval.maxSourceChars);
}

/**
 * Paragraphs of decided cases from the judgments library: cases the question
 * names (by citation or "A v. B") first, then the best full-text matches, at most
 * two paragraphs per judgment. Public reference data, read on the owner connection.
 */
export async function retrieveJudgmentSources(question: string, limit = aiConfig.retrieval.judgmentLimit): Promise<Source[]> {
  if (limit <= 0) return [];
  const { candidates, terms } = await judgmentCandidates(question);
  return pickParagraphs(candidates, { limit, perJudgment: 2, terms }).map((c) => ({
    id: "",
    kind: "judgment" as const,
    label: judgmentLabel(c.judgment, c.paraNo),
    text: clip(c.text),
    exact: Boolean(c.exact),
    href: `/app/research/case/${c.judgmentId}${c.paraNo > 0 ? `#para-${c.paraNo}` : ""}`,
    meta: { judgmentId: c.judgmentId, paraNo: c.paraNo },
  }));
}

/**
 * Collects the passages the model may cite: bare-act sections from the public
 * corpus, paragraphs of decided cases from the judgments library and, when a
 * matter or assistant points at them, chunks of the user's own documents (read
 * under row-level security through the caller's `tx`). Sources are numbered
 * S1, S2 … in that order.
 */
export async function retrieveSources(
  tx: Tx,
  opts: { question: string; documentIds: string[]; statuteLimit?: number; judgmentLimit?: number; documentLimit?: number },
): Promise<Source[]> {
  const sources: Source[] = [];

  const limits = aiConfig.retrieval;
  const statuteLimit = opts.statuteLimit ?? limits.statuteLimit;
  const statutes =
    statuteLimit > 0
      ? await searchStatutesMarked(opts.question, { limit: statuteLimit }).catch((e) => {
          logAiError("retrieval", "statute search failed", e);
          return [];
        })
      : [];
  for (const s of statutes) {
    sources.push({
      id: "",
      kind: "statute",
      label: `${s.actTitle}, Section ${s.sectionNo}: ${s.heading}`,
      text: clip(s.text),
      // The question named this section ("s. 103 BNS"): kept first when the context is tight.
      exact: s.exact,
      href: `/app/research/${encodeURIComponent(s.actId)}/${encodeURIComponent(s.sectionNo)}`,
      meta: { actId: s.actId, sectionNo: s.sectionNo },
    });
  }

  const cases = await retrieveJudgmentSources(opts.question, opts.judgmentLimit ?? limits.judgmentLimit).catch((e) => {
    logAiError("retrieval", "judgment search failed", e);
    return [];
  });
  sources.push(...cases);

  const documentLimit = opts.documentLimit ?? limits.documentLimit;
  if (opts.documentIds.length > 0 && documentLimit > 0) {
    const q = opts.question.slice(0, 500);
    const rows = await tx
      .select({
        documentId: documentChunks.documentId,
        content: documentChunks.content,
        idx: documentChunks.idx,
        name: documents.name,
        rank: sql<number>`ts_rank(${documentChunks.tsv}, websearch_to_tsquery('simple', ${q}))`,
      })
      .from(documentChunks)
      .innerJoin(documents, eq(documents.id, documentChunks.documentId))
      .where(
        and(
          inArray(documentChunks.documentId, opts.documentIds),
          sql`${documentChunks.tsv} @@ websearch_to_tsquery('simple', ${q})`,
        ),
      )
      .orderBy(sql`5 desc`)
      .limit(documentLimit);
    for (const r of rows) {
      sources.push({
        id: "",
        kind: "document",
        label: `Your document "${r.name}" (part ${r.idx + 1})`,
        text: clip(r.content),
        href: `/app/documents/${r.documentId}`,
        meta: { documentId: r.documentId },
      });
    }
  }

  return sources.map((s, i) => ({ ...s, id: `S${i + 1}` }));
}

export function matterNote(offenceDate: string | null | undefined): string | null {
  if (!offenceDate) return null;
  const code = governingCriminalCode(offenceDate);
  return code === "BNS"
    ? `Offence date ${offenceDate}: on or after 1 July 2024, so the BNS, BNSS and BSA govern.`
    : `Offence date ${offenceDate}: before 1 July 2024, so the IPC, CrPC and Indian Evidence Act govern.`;
}
