"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { consents, rightsRequests } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { PRIVACY_NOTICE_VERSION, RIGHTS_RESPONSE_DAYS } from "@/lib/privacy";
import { site } from "@/lib/site";
import { formatDate } from "@/lib/utils";

/** Marketing is the only purpose a user can switch off here and keep using the service. */
export async function setMarketingConsent(granted: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = z.boolean().safeParse(granted);
  if (!parsed.success) return fail("Invalid request.");
  try {
    await enforceRateLimit(`consent:${user.id}`, 20, 3600);
    await withUser(user.id, async (tx) => {
      const active = await tx
        .select({ id: consents.id })
        .from(consents)
        .where(and(eq(consents.purpose, "marketing"), isNull(consents.withdrawnAt)))
        .limit(1);
      if (parsed.data && active.length === 0) {
        await tx.insert(consents).values({ userId: user.id, purpose: "marketing", noticeVersion: PRIVACY_NOTICE_VERSION });
      } else if (!parsed.data && active.length > 0) {
        await tx
          .update(consents)
          .set({ withdrawnAt: new Date() })
          .where(and(eq(consents.purpose, "marketing"), isNull(consents.withdrawnAt)));
      }
    });
    await appendAudit({
      action: parsed.data ? "privacy.consent_granted" : "privacy.consent_withdrawn",
      actorId: user.id,
      entityType: "user",
      entityId: user.id,
      data: { purposes: ["marketing"] },
    });
    revalidatePath("/app/settings/privacy");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

const requestSchema = z.object({
  type: z.enum(["access", "correction", "erasure", "grievance"]),
  details: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(4000, "Keep it under 4,000 characters."),
});

const typeLabel = {
  access: "Access to my data",
  correction: "Correction of my data",
  erasure: "Erasure and account closure",
  grievance: "Grievance",
} as const;

export async function createRightsRequest(input: z.input<typeof requestSchema>): Promise<ActionResult<{ dueAt: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  try {
    await enforceRateLimit(`rights:${user.id}`, 5, 24 * 3600);
    const dueAt = new Date(Date.now() + RIGHTS_RESPONSE_DAYS * 24 * 3600 * 1000);
    const [row] = await withUser(user.id, (tx) =>
      tx
        .insert(rightsRequests)
        .values({ userId: user.id, type: parsed.data.type, details: parsed.data.details, dueAt })
        .returning({ id: rightsRequests.id }),
    );
    await appendAudit({
      action: "privacy.rights_request_created",
      actorId: user.id,
      entityType: "rights_request",
      entityId: row.id,
      data: { type: parsed.data.type },
    });
    const ref = row.id.slice(0, 8).toUpperCase();
    await Promise.allSettled([
      sendEmail({
        to: user.email,
        subject: `We received your request (${typeLabel[parsed.data.type]}) · ref ${ref}`,
        text: `Hello ${user.name},\n\nWe have recorded your request: ${typeLabel[parsed.data.type]}.\nReference: ${ref}\nWe will respond by ${formatDate(dueAt)} at the latest (within ${RIGHTS_RESPONSE_DAYS} days, as the DPDP Rules require).\n\nYou can follow its status in Settings → Privacy.\n\nGrievance Officer, Vaakil AI\n${site.grievanceEmail}`,
      }),
      sendEmail({
        to: site.grievanceEmail,
        subject: `New data-principal request: ${typeLabel[parsed.data.type]} · ref ${ref}`,
        text: `A new ${parsed.data.type} request was filed (ref ${ref}). Due ${formatDate(dueAt)}.\nReview it in the admin console under Rights requests.`,
      }),
    ]);
    revalidatePath("/app/settings/privacy");
    return ok({ dueAt: dueAt.toISOString() });
  } catch (err) {
    return toActionError(err);
  }
}
