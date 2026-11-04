"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requestIp } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { rightsRequests, user as userTable } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { appendAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { adminForAction, NOT_ADMIN } from "@/lib/admin/guard";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { site } from "@/lib/site";

const schema = z.object({
  id: z.uuid(),
  status: z.enum(["in_progress", "resolved", "rejected"]),
  response: z.string().trim().min(10, "Write a response the user can act on (at least 10 characters).").max(4000),
});

const statusWord = { in_progress: "is in progress", resolved: "has been resolved", rejected: "has been declined" } as const;

/** rights_requests is select/insert only for app_user, so responses are written here on the owner connection. */
export async function respondToRightsRequest(input: z.input<typeof schema>): Promise<ActionResult> {
  const admin = await adminForAction();
  if (!admin) return fail(NOT_ADMIN);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  const { id, status, response } = parsed.data;
  try {
    const closing = status !== "in_progress";
    const [row] = await db
      .update(rightsRequests)
      .set({ status, response, resolvedAt: closing ? new Date() : null })
      .where(eq(rightsRequests.id, id))
      .returning({ userId: rightsRequests.userId, type: rightsRequests.type });
    if (!row) return fail("Request not found.");

    await appendAudit({
      action: `privacy.rights_request_${status}`,
      actorId: admin.id,
      actorRole: "admin",
      entityType: "rights_request",
      entityId: id,
      ip: await requestIp(),
      data: { type: row.type, userId: row.userId },
    });

    const [u] = await db.select({ email: userTable.email, name: userTable.name }).from(userTable).where(eq(userTable.id, row.userId)).limit(1);
    if (u) {
      const ref = id.slice(0, 8).toUpperCase();
      await sendEmail({
        to: u.email,
        subject: `Your privacy request ${statusWord[status]} · ref ${ref}`,
        text: `Hello ${u.name},\n\nYour ${row.type.replaceAll("_", " ")} request (ref ${ref}) ${statusWord[status]}.\n\n${response}\n\nSee it in Settings → Privacy:\n${env.APP_URL}/app/settings/privacy\n\nIf you are not satisfied, reply to ${site.grievanceEmail}.\n\nGrievance Officer, Vaakil AI`,
      }).catch((err) => console.error("[rights] email failed", err));
    }
    revalidatePath("/admin/rights");
    revalidatePath("/admin");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
