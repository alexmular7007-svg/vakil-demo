"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requestIp } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { advocateProfiles, user as userTable } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { appendAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { adminForAction, NOT_ADMIN } from "@/lib/admin/guard";
import { PUBLIC_ADVOCATES_TAG } from "@/lib/directory/advocates";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";

const idSchema = z.string().trim().min(1).max(100);

/** Approve a pending application: verified_by/at set, role user -> advocate, email, audit. */
export async function approveAdvocate(userId: string): Promise<ActionResult> {
  const admin = await adminForAction();
  if (!admin) return fail(NOT_ADMIN);
  const parsed = idSchema.safeParse(userId);
  if (!parsed.success) return fail("Invalid request.");
  try {
    const result = await db.transaction(async (tx) => {
      const [p] = await tx
        .update(advocateProfiles)
        .set({ verificationStatus: "verified", verifiedBy: admin.id, verifiedAt: new Date(), rejectionReason: null, updatedAt: new Date() })
        .where(and(eq(advocateProfiles.userId, parsed.data), eq(advocateProfiles.verificationStatus, "pending")))
        .returning({ enrolmentNo: advocateProfiles.enrolmentNo, council: advocateProfiles.stateBarCouncil, displayName: advocateProfiles.displayName });
      if (!p) return null;
      // Never downgrade an admin; ordinary users get the advocate role.
      await tx
        .update(userTable)
        .set({ role: "advocate", updatedAt: new Date() })
        .where(and(eq(userTable.id, parsed.data), eq(userTable.role, "user")));
      const [u] = await tx.select({ email: userTable.email, name: userTable.name }).from(userTable).where(eq(userTable.id, parsed.data)).limit(1);
      return { ...p, email: u?.email ?? null, name: u?.name ?? p.displayName };
    });
    if (!result) return fail("This application is no longer pending. Refresh the queue.");

    await appendAudit({
      action: "advocate.verified",
      actorId: admin.id,
      actorRole: "admin",
      entityType: "advocate_profile",
      entityId: parsed.data,
      ip: await requestIp(),
      data: { enrolmentNo: result.enrolmentNo, stateBarCouncil: result.council },
    });
    if (result.email) {
      await sendEmail({
        to: result.email,
        subject: "You are now a verified advocate on Vaakil AI",
        text: `Hello ${result.name},\n\nWe have verified your enrolment (${result.enrolmentNo}, ${result.council}). Your profile now shows the verified advocate badge, and you can act as the Lawyer on e-sign envelopes.\n\nIf you chose to be listed, you now appear in the advocate directory (alphabetical, never ranked). Manage this any time:\n${env.APP_URL}/app/settings/advocate\n\n— Vaakil AI`,
      }).catch((err) => console.error("[verify] email failed", err));
    }
    updateTag(PUBLIC_ADVOCATES_TAG);
    revalidatePath("/admin/verifications");
    revalidatePath("/admin");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

const rejectSchema = z.object({
  userId: idSchema,
  reason: z.string().trim().min(10, "Give the advocate a clear reason (at least 10 characters).").max(1000),
});

/** Reject a pending application, or revoke a verified one. Always with a reason. */
export async function rejectAdvocate(input: z.input<typeof rejectSchema>): Promise<ActionResult> {
  const admin = await adminForAction();
  if (!admin) return fail(NOT_ADMIN);
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  const { userId, reason } = parsed.data;
  try {
    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ status: advocateProfiles.verificationStatus, enrolmentNo: advocateProfiles.enrolmentNo, displayName: advocateProfiles.displayName })
        .from(advocateProfiles)
        .where(eq(advocateProfiles.userId, userId))
        .limit(1)
        .for("update");
      if (!before || before.status === "rejected") return null;
      await tx
        .update(advocateProfiles)
        .set({ verificationStatus: "rejected", verifiedBy: null, verifiedAt: null, rejectionReason: reason, updatedAt: new Date() })
        .where(eq(advocateProfiles.userId, userId));
      await tx
        .update(userTable)
        .set({ role: "user", updatedAt: new Date() })
        .where(and(eq(userTable.id, userId), eq(userTable.role, "advocate")));
      const [u] = await tx.select({ email: userTable.email, name: userTable.name }).from(userTable).where(eq(userTable.id, userId)).limit(1);
      return { previous: before.status, enrolmentNo: before.enrolmentNo, email: u?.email ?? null, name: u?.name ?? before.displayName };
    });
    if (!result) return fail("Nothing to change. Refresh the queue.");

    const revoked = result.previous === "verified";
    await appendAudit({
      action: revoked ? "advocate.verification_revoked" : "advocate.rejected",
      actorId: admin.id,
      actorRole: "admin",
      entityType: "advocate_profile",
      entityId: userId,
      ip: await requestIp(),
      data: { reason, enrolmentNo: result.enrolmentNo },
    });
    if (result.email) {
      await sendEmail({
        to: result.email,
        subject: revoked ? "Your advocate verification on Vaakil AI has been withdrawn" : "We could not verify your advocate enrolment",
        text: `Hello ${result.name},\n\n${
          revoked ? "Your verified advocate status has been withdrawn." : "We could not verify the enrolment details you gave."
        }\n\nReason: ${reason}\n\nYou can correct your details and resubmit here:\n${env.APP_URL}/app/settings/advocate\n\n— Vaakil AI`,
      }).catch((err) => console.error("[verify] email failed", err));
    }
    updateTag(PUBLIC_ADVOCATES_TAG);
    revalidatePath("/admin/verifications");
    revalidatePath("/admin");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
