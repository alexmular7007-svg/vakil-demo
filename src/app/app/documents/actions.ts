"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { generateCompletion, type Tier } from "@/lib/ai/gateway";
import { appendAudit } from "@/lib/audit";
import { getCurrentUser, requestIp } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { aiActionError, completionNotes } from "@/lib/drafting/ai-errors";
import { COMPARE_TASK, DOCUMENT_SYSTEM_PROMPT, SUMMARY_TASK, askTask, clip, docBlock, riskTask } from "@/lib/documents/ai-prompts";
import { diffLines, toDiffLines, toHunks, type DiffHunk, type DiffStats } from "@/lib/documents/diff";
import { relevantChunks } from "@/lib/documents/retrieve";
import { features } from "@/lib/env";
import { deleteFile } from "@/lib/files/storage";
import { enforceRateLimit } from "@/lib/rate-limit";

const docId = z.uuid({ message: "Invalid document." });

/** Below this many characters, questions are answered from the whole document. */
const WHOLE_DOC_FOR_QA = 60_000;

export type DocAiResult = { text: string; notes: string[] };

async function loadReadyDocs(userId: string, ids: string[]) {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ id: documents.id, name: documents.name, status: documents.status, textContent: documents.textContent })
      .from(documents)
      .where(inArray(documents.id, ids)),
  );
  return ids.map((id) => rows.find((r) => r.id === id));
}

async function runDocAi(userId: string, tier: Tier, prompt: string, extraNotes: string[], maxTokens = 6000): Promise<ActionResult<DocAiResult>> {
  await enforceRateLimit(`ai:documents:${userId}`, 12, 300);
  const result = await generateCompletion({
    userId,
    tier,
    system: DOCUMENT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    maxTokens,
  });
  if (result.refused) return fail("The AI declined to analyse this document.");
  const text = result.text.trim();
  if (!text) return fail("The AI returned an empty answer. Please try again.");
  return ok({ text, notes: [...extraNotes, ...completionNotes(result)] });
}

const clippedNote = (name: string) =>
  `“${name}” is long, so only its first part (about 120,000 characters) was analysed. Ask specific questions for later sections.`;

/* ------------------------------- summary -------------------------------- */

export async function summarizeDocument(input: { documentId: string }): Promise<ActionResult<DocAiResult>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  if (!features.ai) return fail("AI document review is not switched on for this workspace yet.");
  try {
    const { documentId } = z.object({ documentId: docId }).parse(input);
    const [doc] = await loadReadyDocs(user.id, [documentId]);
    if (!doc) return fail("This document was not found.");
    if (doc.status !== "ready" || !doc.textContent) return fail("This document has no extracted text to analyse.");
    const c = clip(doc.textContent);
    return await runDocAi(user.id, "standard", `${docBlock(doc.name, c.text)}\n\n${SUMMARY_TASK}`, c.clipped ? [clippedNote(doc.name)] : []);
  } catch (err) {
    return aiActionError(err);
  }
}

/* -------------------------------- risks --------------------------------- */

const riskSchema = z.object({
  documentId: docId,
  role: z.string().trim().min(2, "Say whom you represent.").max(120, "Keep this under 120 characters."),
});

export async function reviewDocumentRisks(input: z.input<typeof riskSchema>): Promise<ActionResult<DocAiResult>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  if (!features.ai) return fail("AI document review is not switched on for this workspace yet.");
  try {
    const data = riskSchema.parse(input);
    const [doc] = await loadReadyDocs(user.id, [data.documentId]);
    if (!doc) return fail("This document was not found.");
    if (doc.status !== "ready" || !doc.textContent) return fail("This document has no extracted text to analyse.");
    const c = clip(doc.textContent);
    // The role is user text: keep it on one line and out of the tag structure.
    const role = data.role.replace(/[<>\n\r]/g, " ");
    return await runDocAi(user.id, "pro", `${docBlock(doc.name, c.text)}\n\n${riskTask(role)}`, c.clipped ? [clippedNote(doc.name)] : [], 8000);
  } catch (err) {
    return aiActionError(err);
  }
}

/* --------------------------------- ask ---------------------------------- */

const askSchema = z.object({
  documentId: docId,
  question: z.string().trim().min(3, "Type a question.").max(2000, "Keep the question under 2,000 characters."),
});

export async function askDocument(input: z.input<typeof askSchema>): Promise<ActionResult<DocAiResult>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  if (!features.ai) return fail("AI document review is not switched on for this workspace yet.");
  try {
    const data = askSchema.parse(input);
    const [doc] = await loadReadyDocs(user.id, [data.documentId]);
    if (!doc) return fail("This document was not found.");
    if (doc.status !== "ready" || !doc.textContent) return fail("This document has no extracted text to search.");
    const question = data.question.replace(/<\/?question>/gi, "");
    if (doc.textContent.length <= WHOLE_DOC_FOR_QA) {
      return await runDocAi(user.id, "standard", `${docBlock(doc.name, doc.textContent)}\n\n${askTask(question, false)}`, [], 3000);
    }
    const excerpts = await relevantChunks(user.id, doc.id, question, 8);
    const text = excerpts.map((e) => `[Excerpt ${e.idx + 1}]\n${e.content}`).join("\n\n");
    return await runDocAi(
      user.id,
      "standard",
      `${docBlock(doc.name, text)}\n\n${askTask(question, true)}`,
      ["This is a long document, so the answer is based on the passages that best matched your question."],
      3000,
    );
  } catch (err) {
    return aiActionError(err);
  }
}

/* ------------------------------- compare -------------------------------- */

const compareSchema = z.object({ documentId: docId, otherId: docId });

export async function compareDocumentsWithAi(input: z.input<typeof compareSchema>): Promise<ActionResult<DocAiResult>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  if (!features.ai) return fail("AI comparison is not switched on for this workspace yet.");
  try {
    const data = compareSchema.parse(input);
    if (data.documentId === data.otherId) return fail("Choose a different document to compare with.");
    const [a, b] = await loadReadyDocs(user.id, [data.documentId, data.otherId]);
    if (!a || !b) return fail("One of the documents was not found.");
    if (!a.textContent || !b.textContent) return fail("Both documents need extracted text to compare.");
    const ca = clip(a.textContent, 60_000);
    const cb = clip(b.textContent, 60_000);
    const notes = [ca.clipped ? a.name : null, cb.clipped ? b.name : null]
      .filter((n): n is string => Boolean(n))
      .map((n) => `“${n}” is long, so only its first part (about 60,000 characters) was compared.`);
    const prompt = `${docBlock(a.name, ca.text, "Document A")}\n\n${docBlock(b.name, cb.text, "Document B")}\n\n${COMPARE_TASK}`;
    return await runDocAi(user.id, "pro", prompt, notes, 6000);
  } catch (err) {
    return aiActionError(err);
  }
}

export type LineDiffResult =
  | { ok: true; stats: DiffStats; hunks: DiffHunk[]; truncated: boolean; otherName: string }
  | { ok: false; reason: "too-different"; stats: DiffStats; otherName: string };

const MAX_DIFF_LINES = 4000;

/** Deterministic line-by-line comparison computed in code. Works without AI. */
export async function diffDocuments(input: z.input<typeof compareSchema>): Promise<ActionResult<LineDiffResult>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const data = compareSchema.parse(input);
    if (data.documentId === data.otherId) return fail("Choose a different document to compare with.");
    await enforceRateLimit(`documents:diff:${user.id}`, 30, 60);
    const [a, b] = await loadReadyDocs(user.id, [data.documentId, data.otherId]);
    if (!a || !b) return fail("One of the documents was not found.");
    if (!a.textContent || !b.textContent) return fail("Both documents need extracted text to compare.");
    const result = diffLines(toDiffLines(a.textContent), toDiffLines(b.textContent));
    if (!result.ok) return ok({ ok: false, reason: result.reason, stats: result.stats, otherName: b.name });
    // Cap what is sent to the browser.
    const hunks: DiffHunk[] = [];
    let shown = 0;
    let truncated = false;
    for (const h of toHunks(result.lines, 2)) {
      if (h.kind === "skip") {
        hunks.push(h);
        continue;
      }
      if (shown + h.lines.length > MAX_DIFF_LINES) {
        truncated = true;
        break;
      }
      hunks.push(h);
      shown += h.lines.length;
    }
    return ok({ ok: true, stats: result.stats, hunks, truncated, otherName: b.name });
  } catch (err) {
    return toActionError(err);
  }
}

/* -------------------------------- delete -------------------------------- */

export async function deleteDocument(input: { documentId: string }): Promise<ActionResult<undefined>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const { documentId } = z.object({ documentId: docId }).parse(input);
    const removed = await withUser(user.id, (tx) =>
      tx
        .delete(documents)
        .where(eq(documents.id, documentId))
        .returning({ id: documents.id, storageKey: documents.storageKey, sha256: documents.sha256 }),
    );
    if (removed.length === 0) return fail("This document was not found.");
    await deleteFile(removed[0].storageKey).catch((err) => console.error("[documents] file delete failed", err));
    await appendAudit({
      action: "document.deleted",
      actorId: user.id,
      actorRole: user.role,
      entityType: "document",
      entityId: documentId,
      ip: await requestIp(),
      data: { sha256: removed[0].sha256 },
    });
    revalidatePath("/app/documents");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
