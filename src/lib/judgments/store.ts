import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import { judgmentParas, judgments } from "@/lib/db/schema";
import { sha256 } from "@/lib/crypto";
import type { JudgmentPara } from "./text";

export type NewJudgment = {
  court: string;
  title: string;
  decidedOn: string | null;
  citation: string | null;
  caseNo: string | null;
  bench: string | null;
  sourceUrl: string | null;
  licence: string;
  sourceKey: string;
  /** Dataset id; for uploads a hash of the text, so the same judgment is not added twice. */
  externalId: string | null;
  parties: string | null;
  summary: string | null;
  addedBy: string | null;
  paras: JudgmentPara[];
};

/** Stable id for an uploaded judgment's text (whitespace-insensitive). */
export function uploadFingerprint(paras: JudgmentPara[]): string {
  return `sha256:${sha256(paras.map((p) => p.text.replace(/\s+/g, " ").trim()).join("\n")).slice(0, 40)}`;
}

// NUL and other C0 control characters (except tab and newlines) come out of some PDF
// text layers; Postgres text cannot hold NUL, and none of them belong in a judgment.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Strips characters Postgres text cannot store (and other invisible control characters). */
export function cleanStoredText(s: string): string {
  return s.replace(CONTROL, "");
}

/**
 * Inserts a judgment and its paragraphs in one transaction. Idempotent on
 * (sourceKey, externalId): returns null when that record is already stored.
 * Runs on the owner connection; callers authorise first (admin route, importer).
 */
export async function insertJudgment(j: NewJudgment, conn: Db = db): Promise<{ id: string } | null> {
  return conn.transaction(async (tx) => {
    const [row] = await tx
      .insert(judgments)
      .values({
        court: j.court,
        title: cleanStoredText(j.title),
        decidedOn: j.decidedOn,
        citation: j.citation,
        caseNo: j.caseNo,
        bench: j.bench,
        sourceUrl: j.sourceUrl,
        licence: j.licence,
        sourceKey: j.sourceKey,
        externalId: j.externalId,
        parties: j.parties,
        summary: j.summary === null ? null : cleanStoredText(j.summary),
        addedBy: j.addedBy,
      })
      .onConflictDoNothing({ target: [judgments.sourceKey, judgments.externalId] })
      .returning({ id: judgments.id });
    if (!row) return null;
    for (let i = 0; i < j.paras.length; i += 200) {
      await tx.insert(judgmentParas).values(j.paras.slice(i, i + 200).map((p) => ({ judgmentId: row.id, paraNo: p.paraNo, text: cleanStoredText(p.text) })));
    }
    return row;
  });
}

/** Existing record id for (sourceKey, externalId), if any. */
export async function existingJudgmentId(sourceKey: string, externalId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: judgments.id })
    .from(judgments)
    .where(and(eq(judgments.sourceKey, sourceKey), eq(judgments.externalId, externalId)))
    .limit(1);
  return row?.id ?? null;
}
