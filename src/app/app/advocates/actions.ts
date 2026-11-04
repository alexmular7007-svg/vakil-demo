"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { db, withUser } from "@/lib/db";
import { advocateProfiles, chats, consultations, user as userTable } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { appendAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";

const requestSchema = z.object({
  advocateId: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(5, "Add a short subject (at least 5 characters).").max(140, "Keep the subject under 140 characters."),
  summary: z
    .string()
    .trim()
    .min(30, "Describe the matter in a few sentences (at least 30 characters).")
    .max(4000, "Keep the summary under 4,000 characters."),
  chatId: z.uuid().nullable(),
});

async function contactOf(userId: string) {
  // Owner connection, by an id taken from a row the caller is party to.
  const [row] = await db.select({ name: userTable.name, email: userTable.email }).from(userTable).where(eq(userTable.id, userId)).limit(1);
  return row ?? null;
}

export async function requestConsultation(input: z.input<typeof requestSchema>): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  const v = parsed.data;
  if (v.advocateId === user.id) return fail("You cannot send a consultation request to yourself.");
  try {
    await enforceRateLimit(`consult-req:${user.id}`, 5, 3600);
    await enforceRateLimit(`consult-req-day:${user.id}`, 15, 24 * 3600);

    const result = await withUser(user.id, async (tx) => {
      const [adv] = await tx
        .select({ displayName: advocateProfiles.displayName, accepts: advocateProfiles.acceptsConsultations })
        .from(advocateProfiles)
        .where(
          and(
            eq(advocateProfiles.userId, v.advocateId),
            eq(advocateProfiles.verificationStatus, "verified"),
            eq(advocateProfiles.isListed, true),
          ),
        )
        .limit(1);
      if (!adv) return { error: "This advocate is not available in the directory." } as const;
      if (!adv.accepts) return { error: "This advocate is not accepting consultation requests right now." } as const;

      if (v.chatId) {
        const [chat] = await tx.select({ id: chats.id }).from(chats).where(eq(chats.id, v.chatId)).limit(1);
        if (!chat) return { error: "That conversation could not be found." } as const;
      }

      const [open] = await tx
        .select({ id: consultations.id })
        .from(consultations)
        .where(
          and(
            eq(consultations.requesterId, user.id),
            eq(consultations.advocateId, v.advocateId),
            eq(consultations.status, "requested"),
          ),
        )
        .limit(1);
      if (open) return { error: "You already have an open request with this advocate. Wait for a reply or withdraw it first." } as const;

      const [row] = await tx
        .insert(consultations)
        .values({ requesterId: user.id, advocateId: v.advocateId, chatId: v.chatId, subject: v.subject, summary: v.summary })
        .returning({ id: consultations.id });
      return { id: row.id, advocateName: adv.displayName } as const;
    });
    if ("error" in result) return fail(result.error ?? "Could not send the request.");

    await appendAudit({
      action: "consultation.requested",
      actorId: user.id,
      entityType: "consultation",
      entityId: result.id,
      data: { advocateId: v.advocateId, linkedChat: Boolean(v.chatId) },
    });

    const advocate = await contactOf(v.advocateId);
    if (advocate) {
      await sendEmail({
        to: advocate.email,
        subject: `New consultation request: ${v.subject}`,
        text: `Hello ${result.advocateName},\n\n${user.name} has sent you a consultation request through Vaakil AI.\n\nSubject: ${v.subject}\n\n${v.summary}\n\nAccept or decline it in your inbox:\n${env.APP_URL}/app/advocates/inbox\n\nYou are under no obligation to accept. Vaakil AI does not take any fee or commission on consultations.\n\n— Vaakil AI`,
      }).catch((err) => console.error("[consultation] advocate email failed", err));
    }

    revalidatePath("/app/advocates/inbox");
    return ok({ id: result.id });
  } catch (err) {
    return toActionError(err);
  }
}

const respondSchema = z.object({
  id: z.uuid(),
  decision: z.enum(["accepted", "declined", "closed"]),
  note: z.string().trim().max(2000, "Keep the note under 2,000 characters."),
});

/** The advocate accepts or declines a request, or closes an accepted one. */
export async function respondToConsultation(input: z.input<typeof respondSchema>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  const v = parsed.data;
  try {
    await enforceRateLimit(`consult-respond:${user.id}`, 60, 3600);
    const result = await withUser(user.id, async (tx) => {
      const [me] = await tx
        .select({ status: advocateProfiles.verificationStatus, displayName: advocateProfiles.displayName })
        .from(advocateProfiles)
        .where(eq(advocateProfiles.userId, user.id))
        .limit(1);
      if (me?.status !== "verified") return { error: "Only verified advocates can respond to requests." } as const;
      const [c] = await tx
        .select({ id: consultations.id, status: consultations.status, requesterId: consultations.requesterId, subject: consultations.subject })
        .from(consultations)
        .where(and(eq(consultations.id, v.id), eq(consultations.advocateId, user.id)))
        .limit(1);
      if (!c) return { error: "Request not found." } as const;
      const allowed = v.decision === "closed" ? c.status === "accepted" : c.status === "requested";
      if (!allowed) return { error: "This request has already been answered." } as const;
      await tx
        .update(consultations)
        .set({ status: v.decision, advocateNote: v.note || null, updatedAt: new Date() })
        .where(and(eq(consultations.id, v.id), eq(consultations.advocateId, user.id)));
      return { requesterId: c.requesterId, subject: c.subject, advocateName: me.displayName } as const;
    });
    if ("error" in result) return fail(result.error ?? "Could not update the request.");

    await appendAudit({
      action: `consultation.${v.decision}`,
      actorId: user.id,
      entityType: "consultation",
      entityId: v.id,
    });

    if (v.decision !== "closed") {
      const requester = await contactOf(result.requesterId);
      if (requester) {
        const accepted = v.decision === "accepted";
        await sendEmail({
          to: requester.email,
          subject: `${result.advocateName} ${accepted ? "accepted" : "declined"} your consultation request`,
          text: `Hello ${requester.name},\n\n${result.advocateName} has ${accepted ? "accepted" : "declined"} your request "${result.subject}".${
            v.note ? `\n\nNote from the advocate:\n${v.note}` : ""
          }\n\n${
            accepted
              ? "The advocate can now see your email address and will contact you directly. Any engagement and fees are agreed between you and the advocate; Vaakil AI takes no part in them."
              : "You can send a request to another advocate from the directory."
          }\n\n${env.APP_URL}/app/advocates/inbox\n\n— Vaakil AI`,
        }).catch((err) => console.error("[consultation] requester email failed", err));
      }
    }

    revalidatePath("/app/advocates/inbox");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

/** The requester withdraws a request the advocate has not answered yet. */
export async function withdrawConsultation(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return fail("Invalid request.");
  try {
    const updated = await withUser(user.id, (tx) =>
      tx
        .update(consultations)
        .set({ status: "closed", updatedAt: new Date() })
        .where(and(eq(consultations.id, parsed.data), eq(consultations.requesterId, user.id), eq(consultations.status, "requested")))
        .returning({ id: consultations.id }),
    );
    if (updated.length === 0) return fail("This request can no longer be withdrawn.");
    await appendAudit({ action: "consultation.withdrawn", actorId: user.id, entityType: "consultation", entityId: parsed.data });
    revalidatePath("/app/advocates/inbox");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
