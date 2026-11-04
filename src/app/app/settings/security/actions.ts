"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/server";
import { getCurrentUser, getSession, requestIp } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { session as sessionTable, user as userTable } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(128),
    newPassword: z.string().min(10, "Use at least 10 characters.").max(128, "Use at most 128 characters."),
    confirmPassword: z.string(),
    revokeOtherSessions: z.boolean(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "The passwords do not match." })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a password you have not used here." });

export async function changePassword(input: z.input<typeof passwordSchema>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  try {
    await enforceRateLimit(`pw-change:${user.id}`, 5, 15 * 60);
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: parsed.data.revokeOtherSessions,
      },
      headers: await headers(),
    });
    await appendAudit({
      action: "auth.password_changed",
      actorId: user.id,
      entityType: "user",
      entityId: user.id,
      ip: await requestIp(),
      data: { revokedOtherSessions: parsed.data.revokeOtherSessions },
    });
    revalidatePath("/app/settings/security");
    return ok(undefined);
  } catch (err) {
    if (err instanceof APIError) {
      const msg = String(err.body?.message ?? err.message ?? "");
      if (/invalid password/i.test(msg)) return fail("Your current password is incorrect.", { currentPassword: "Incorrect password." });
      if (/credential account/i.test(msg)) return fail("This account signs in without a password.");
      return fail(msg || "Could not change the password.");
    }
    return toActionError(err);
  }
}

/**
 * Records a 2FA change in the audit log after the client finished the Better Auth
 * flow. The state is read from the database, so the entry reflects what is true.
 */
export async function recordTwoFactorChange(expected: "enabled" | "disabled"): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = z.enum(["enabled", "disabled"]).safeParse(expected);
  if (!parsed.success) return fail("Invalid request.");
  try {
    await enforceRateLimit(`2fa-audit:${user.id}`, 10, 3600);
    const [row] = await db.select({ on: userTable.twoFactorEnabled }).from(userTable).where(eq(userTable.id, user.id)).limit(1);
    const actual = row?.on ? "enabled" : "disabled";
    if (actual === parsed.data) {
      await appendAudit({
        action: actual === "enabled" ? "auth.2fa_enabled" : "auth.2fa_disabled",
        actorId: user.id,
        entityType: "user",
        entityId: user.id,
        ip: await requestIp(),
      });
    }
    revalidatePath("/app/settings/security");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

export async function revokeSession(sessionId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = z.string().min(1).max(200).safeParse(sessionId);
  if (!parsed.success) return fail("Invalid session.");
  try {
    const current = await getSession();
    if (current?.session.id === parsed.data) return fail("Use Sign out to end this session.");
    const [row] = await db
      .select({ token: sessionTable.token })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, parsed.data), eq(sessionTable.userId, user.id)))
      .limit(1);
    if (!row) return fail("That session has already ended.");
    await auth.api.revokeSession({ body: { token: row.token }, headers: await headers() });
    await appendAudit({ action: "auth.session_revoked", actorId: user.id, entityType: "session", entityId: parsed.data, ip: await requestIp() });
    revalidatePath("/app/settings/security");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

export async function revokeOtherSessions(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    await auth.api.revokeOtherSessions({ headers: await headers() });
    await appendAudit({ action: "auth.other_sessions_revoked", actorId: user.id, entityType: "user", entityId: user.id, ip: await requestIp() });
    revalidatePath("/app/settings/security");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
