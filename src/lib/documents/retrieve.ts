import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { documentChunks } from "@/lib/db/schema";

// Common words that carry no meaning for retrieval (English and Hindi).
const STOP = new Set(
  (
    "the and for are but not you all any can had her was one our out has have his how its may new now see two who did get him let say she too use " +
    "what when where which while with will would shall should could this that these those there their them they then than from into onto upon about " +
    "does doing done been being under over such each other some more most only own same very just also there here why whom whose your yours " +
    "document agreement clause section page per please tell explain give list show find "
  ).split(/\s+/),
);
const STOP_HI = new Set("का की के है हैं में और से को पर क्या कौन कब कहाँ कैसे यह वह इस उस एक भी तो ही था थी थे गया गई किया करें कर होगा होगी लिए साथ".split(" "));

/** Builds an OR prefix query for Postgres full-text search from a question. Only letters, marks and digits pass. */
export function keywordQuery(question: string): string | null {
  const words = question.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const terms = [...new Set(words.filter((w) => (w.length >= 3 || /^\d+$/.test(w)) && !STOP.has(w) && !STOP_HI.has(w)))].slice(0, 16);
  if (terms.length === 0) return null;
  return terms.map((w) => `${w}:*`).join(" | ");
}

export type Excerpt = { idx: number; content: string };

/** The chunks of one document that best match a question, in reading order. */
export async function relevantChunks(userId: string, documentId: string, question: string, limit = 8): Promise<Excerpt[]> {
  const q = keywordQuery(question);
  if (q) {
    try {
      const rank = sql<number>`ts_rank(${documentChunks.tsv}, to_tsquery('simple', ${q}))`;
      const rows = await withUser(userId, (tx) =>
        tx
          .select({ idx: documentChunks.idx, content: documentChunks.content })
          .from(documentChunks)
          .where(and(eq(documentChunks.documentId, documentId), sql`${documentChunks.tsv} @@ to_tsquery('simple', ${q})`))
          .orderBy(desc(rank))
          .limit(limit),
      );
      if (rows.length) return rows.sort((a, b) => a.idx - b.idx);
    } catch (err) {
      console.error("[documents] keyword search failed", err);
    }
  }
  // Nothing matched: fall back to the opening of the document.
  return withUser(userId, (tx) =>
    tx
      .select({ idx: documentChunks.idx, content: documentChunks.content })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
      .orderBy(asc(documentChunks.idx))
      .limit(limit),
  );
}
