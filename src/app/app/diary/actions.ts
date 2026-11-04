"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { ActionError, ActionFieldError, fail, ok, type ActionResult } from "@/lib/action";
import { defineAction } from "@/lib/define-action";
import { generateCompletion } from "@/lib/ai/gateway";
import { getCurrentUser } from "@/lib/auth/dal";
import { withUser, type Tx } from "@/lib/db";
import { documents, hearings, matters, tasks } from "@/lib/db/schema";
import { formatYmd, todayIST } from "@/lib/diary/dates";
import { ORDER_SYSTEM_PROMPT, clipOrderText, parseOrderProposal, quoteAppearsIn } from "@/lib/diary/order-proposal";
import {
  HearingInput,
  OrderInput,
  OutcomeInput,
  TaskInput,
  type HearingInputValues,
  type OrderInputValues,
  type OutcomeInputValues,
  type TaskInputValues,
} from "@/lib/diary/schemas";
import type { OrderProposal } from "@/lib/diary/types";
import { aiActionError, completionNotes } from "@/lib/drafting/ai-errors";
import { features } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";

const uuid = z.uuid({ message: "Invalid id." });

/** Pages that show diary data for these matters. */
function diaryPaths(...matterIds: (string | null | undefined)[]) {
  return ["/app/diary", "/app", ...matterIds.map((id) => (id ? `/app/matters/${id}` : null))];
}

/**
 * Friendly field error before the database's same-owner guard would refuse it:
 * a matter id must belong to this user (RLS hides other users' matters).
 */
async function assertOwnMatter(tx: Tx, matterId: string | null) {
  if (!matterId) return;
  const [m] = await tx.select({ id: matters.id }).from(matters).where(eq(matters.id, matterId)).limit(1);
  if (!m) throw new ActionFieldError("matterId", "That matter was not found");
}

/* -------------------------------- hearings -------------------------------- */

const createHearingAction = defineAction({
  input: HearingInput,
  run: async ({ user, tx, input }) => {
    await assertOwnMatter(tx, input.matterId);
    const [r] = await tx
      .insert(hearings)
      .values({ ...input, ownerId: user.id })
      .returning({ id: hearings.id });
    return { id: r.id, hearingDate: input.hearingDate };
  },
  audit: (input, r) => ({ action: "hearing.created", entityType: "hearing", entityId: r.id, data: { hearingDate: input.hearingDate } }),
  revalidate: (input) => diaryPaths(input.matterId),
});

export async function createHearing(input: HearingInputValues): Promise<ActionResult<{ id: string; hearingDate: string }>> {
  return createHearingAction(input);
}

const updateHearingAction = defineAction({
  input: HearingInput.extend({ id: uuid }),
  run: async ({ tx, input: { id, ...data } }) => {
    const [old] = await tx.select({ matterId: hearings.matterId }).from(hearings).where(eq(hearings.id, id)).limit(1);
    if (!old) throw new ActionError("Hearing not found.");
    await assertOwnMatter(tx, data.matterId);
    await tx
      .update(hearings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(hearings.id, id));
    return { id, hearingDate: data.hearingDate, previousMatterId: old.matterId };
  },
  audit: (input) => ({ action: "hearing.updated", entityType: "hearing", entityId: input.id, data: { hearingDate: input.hearingDate } }),
  revalidate: (input, r) => diaryPaths(r.previousMatterId, input.matterId),
});

export async function updateHearing(id: string, input: HearingInputValues): Promise<ActionResult<{ id: string; hearingDate: string }>> {
  const r = await updateHearingAction({ ...input, id });
  return r.ok ? ok({ id: r.data.id, hearingDate: r.data.hearingDate }) : r;
}

const deleteHearingAction = defineAction({
  input: z.object({ id: uuid }),
  run: async ({ tx, input: { id } }) => {
    // Unlink any earlier hearing that pointed here as its next date.
    await tx.update(hearings).set({ nextHearingId: null }).where(eq(hearings.nextHearingId, id));
    const [gone] = await tx.delete(hearings).where(eq(hearings.id, id)).returning({ matterId: hearings.matterId, hearingDate: hearings.hearingDate });
    if (!gone) throw new ActionError("Hearing not found.");
    return gone;
  },
  audit: (input, gone) => ({ action: "hearing.deleted", entityType: "hearing", entityId: input.id, data: { hearingDate: gone.hearingDate } }),
  revalidate: (_input, gone) => diaryPaths(gone.matterId),
});

export async function deleteHearing(id: string): Promise<ActionResult> {
  const r = await deleteHearingAction({ id });
  return r.ok ? ok(undefined) : r;
}

/**
 * Records what happened at a hearing. With a next date, creates the next diary
 * entry (copying the case details) and links it; re-recording moves that entry.
 */
const recordOutcomeAction = defineAction({
  input: OutcomeInput,
  run: async ({ user, tx, input: data }) => {
    const [h] = await tx.select().from(hearings).where(eq(hearings.id, data.id)).limit(1);
    if (!h) throw new ActionError("Hearing not found.");
    if (data.nextDate && data.nextDate <= h.hearingDate) throw new ActionFieldError("nextDate", "The next date must be after this hearing");

    let nextId: string | null = null;
    if (data.nextDate) {
      const [existing] = h.nextHearingId ? await tx.select({ id: hearings.id }).from(hearings).where(eq(hearings.id, h.nextHearingId)).limit(1) : [];
      if (existing) {
        await tx
          .update(hearings)
          .set({
            hearingDate: data.nextDate,
            ...(data.nextTime ? { hearingTime: data.nextTime } : {}),
            ...(data.nextPurpose ? { purpose: data.nextPurpose } : {}),
            updatedAt: new Date(),
          })
          .where(eq(hearings.id, existing.id));
        nextId = existing.id;
      } else {
        const [n] = await tx
          .insert(hearings)
          .values({
            ownerId: user.id,
            matterId: h.matterId,
            caseTitle: h.caseTitle,
            court: h.court,
            bench: h.bench,
            caseNo: h.caseNo,
            cnr: h.cnr,
            hearingDate: data.nextDate,
            hearingTime: data.nextTime,
            purpose: data.nextPurpose,
          })
          .returning({ id: hearings.id });
        nextId = n.id;
      }
    }

    await tx
      .update(hearings)
      .set({ status: data.status, outcome: data.outcome, nextHearingId: nextId ?? h.nextHearingId, updatedAt: new Date() })
      .where(eq(hearings.id, h.id));
    return { matterId: h.matterId, nextHearingId: nextId, nextDate: data.nextDate };
  },
  audit: (data, r) => ({
    action: "hearing.outcome_recorded",
    entityType: "hearing",
    entityId: data.id,
    data: { status: data.status, nextDate: data.nextDate, nextHearingId: r.nextHearingId },
  }),
  revalidate: (_data, r) => diaryPaths(r.matterId),
});

export async function recordOutcome(input: OutcomeInputValues): Promise<ActionResult<{ nextHearingId: string | null; nextDate: string | null }>> {
  const r = await recordOutcomeAction(input);
  return r.ok ? ok({ nextHearingId: r.data.nextHearingId, nextDate: r.data.nextDate }) : r;
}

/* ---------------------------------- tasks --------------------------------- */

const createTaskAction = defineAction({
  input: TaskInput,
  run: async ({ user, tx, input }) => {
    await assertOwnMatter(tx, input.matterId);
    const [r] = await tx
      .insert(tasks)
      .values({ ...input, ownerId: user.id })
      .returning({ id: tasks.id });
    return { id: r.id };
  },
  revalidate: (input) => diaryPaths(input.matterId),
});

export async function createTask(input: TaskInputValues): Promise<ActionResult<{ id: string }>> {
  return createTaskAction(input);
}

const toggleTaskAction = defineAction({
  input: z.object({ id: uuid, done: z.boolean() }),
  run: async ({ tx, input: { id, done } }) => {
    const [row] = await tx
      .update(tasks)
      .set({ done, doneAt: done ? new Date() : null, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning({ matterId: tasks.matterId });
    if (!row) throw new ActionError("Task not found.");
    return row;
  },
  revalidate: (_input, row) => diaryPaths(row.matterId),
});

export async function toggleTask(id: string, done: boolean): Promise<ActionResult> {
  const r = await toggleTaskAction({ id, done });
  return r.ok ? ok(undefined) : r;
}

const deleteTaskAction = defineAction({
  input: z.object({ id: uuid }),
  run: async ({ tx, input: { id } }) => {
    const [row] = await tx.delete(tasks).where(eq(tasks.id, id)).returning({ matterId: tasks.matterId });
    if (!row) throw new ActionError("Task not found.");
    return row;
  },
  audit: (input) => ({ action: "task.deleted", entityType: "task", entityId: input.id }),
  revalidate: (_input, row) => diaryPaths(row.matterId),
});

export async function deleteTask(id: string): Promise<ActionResult> {
  const r = await deleteTaskAction({ id });
  return r.ok ? ok(undefined) : r;
}

/* ------------------------------ read an order ----------------------------- */

export type OrderReading = {
  proposal: OrderProposal;
  /** The quoted evidence was found word for word in the order text. */
  evidenceFound: boolean;
  /** Matter of the picked document, if it is linked to one. */
  matterId: string | null;
  notes: string[];
};

/**
 * AI reads a pasted order (or an uploaded document's text) and proposes the next
 * date, purpose and court. Nothing is saved: the user reviews the proposal in the
 * hearing form and saves it themselves.
 */
export async function readOrder(input: OrderInputValues): Promise<ActionResult<OrderReading>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  if (!features.ai) return fail("AI is not configured on this server, so orders cannot be read automatically. Enter the next date yourself.");
  try {
    const data = OrderInput.parse(input);
    let source = (data.text ?? "").trim();
    let matterId: string | null = null;
    if (data.documentId) {
      const docId = data.documentId;
      const [doc] = await withUser(user.id, (tx) =>
        tx
          .select({ status: documents.status, textContent: documents.textContent, matterId: documents.matterId })
          .from(documents)
          .where(eq(documents.id, docId))
          .limit(1),
      );
      if (!doc) return fail("This document was not found.");
      if (doc.status !== "ready" || !doc.textContent) return fail("This document has no extracted text to read.");
      source = doc.textContent;
      matterId = doc.matterId;
    }
    await enforceRateLimit(`ai:diary-order:${user.id}`, 10, 300);
    const clip = clipOrderText(source);
    const today = todayIST();
    const result = await generateCompletion({
      userId: user.id,
      tier: "fast",
      system: ORDER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Today's date, for context only: ${today}.\n\n<order>\n${clip.text.replaceAll("</order>", "")}\n</order>`,
        },
      ],
      maxTokens: 600,
    });
    if (result.refused) return fail("The AI declined to read this order.");
    const proposal = parseOrderProposal(result.text);
    if (!proposal) return fail("The AI could not read this order. Enter the next date yourself.");
    const notes = completionNotes(result);
    if (clip.clipped) notes.push("The text is long, so only its beginning and end were read.");
    if (!proposal.nextDate) notes.push("No next date was found in the order. Fill it in yourself.");
    else if (proposal.nextDate < today) notes.push(`The date read (${formatYmd(proposal.nextDate)}) is in the past. Check it against the order.`);
    return ok({ proposal, evidenceFound: quoteAppearsIn(source, proposal.evidence), matterId, notes });
  } catch (e) {
    return aiActionError(e);
  }
}
