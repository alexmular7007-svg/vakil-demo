"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/server";
import { requestIp } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { advocateProfiles, session as sessionTable, user as userTable } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { adminForAction, NOT_ADMIN } from "@/lib/admin/guard";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";

const idSchema = z.string().trim().min(1).max(100);

function authError(err: unknown) {
  if (err instanceof APIError) return fail(String(err.body?.message ?? err.message ?? "The request was refused."));
  return toActionError(err);
}

export async function setUserRole(input: { userId: string; role: "user" | "advocate" | "admin" }): Promise<ActionResult> {
  const admin = await adminForAction();
  if (!admin) return fail(NOT_ADMIN);
  const parsed = z.object({ userId: idSchema, role: z.enum(["user", "advocate", "admin"]) }).safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const { userId, role } = parsed.data;
  if (userId === admin.id) return fail("You cannot change your own role. Ask another administrator.");
  try {
    const [target] = await db.select({ role: userTable.role }).from(userTable).where(eq(userTable.id, userId)).limit(1);
    if (!target) return fail("User not found.");
    if (role === "advocate") {
      const [p] = await db
        .select({ status: advocateProfiles.verificationStatus })
        .from(advocateProfiles)
        .where(eq(advocateProfiles.userId, userId))
        .limit(1);
      if (p?.status !== "verified") return fail("Only verified advocates can have the advocate role. Approve their verification instead.");
    }
    // Better Auth's setRole only knows "user" | "admin", so the role is written on the
    // owner connection. Removing admin rights also ends the user's sessions.
    await db.update(userTable).set({ role, updatedAt: new Date() }).where(eq(userTable.id, userId));
    if (target.role === "admin" && role !== "admin") {
      await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
    }
    await appendAudit({
      action: "admin.user_role_changed",
      actorId: admin.id,
      actorRole: "admin",
      entityType: "user",
      entityId: userId,
      ip: await requestIp(),
      data: { from: target.role ?? "user", to: role },
    });
    revalidatePath("/admin/users");
    return ok(undefined);
  } catch (err) {
    return authError(err);
  }
}

export async function banUser(input: { userId: string; reason: string; days: number | null }): Promise<ActionResult> {
  const admin = await adminForAction();
  if (!admin) return fail(NOT_ADMIN);
  const parsed = z
    .object({
      userId: idSchema,
      reason: z.string().trim().min(5, "Give a reason (at least 5 characters).").max(500),
      days: z.number().int().min(1).max(3650).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  const { userId, reason, days } = parsed.data;
  if (userId === admin.id) return fail("You cannot ban yourself.");
  try {
    await auth.api.banUser({
      body: { userId, banReason: reason, ...(days ? { banExpiresIn: days * 24 * 3600 } : {}) },
      headers: await headers(),
    });
    await appendAudit({
      action: "admin.user_banned",
      actorId: admin.id,
      actorRole: "admin",
      entityType: "user",
      entityId: userId,
      ip: await requestIp(),
      data: { reason, days },
    });
    revalidatePath("/admin/users");
    return ok(undefined);
  } catch (err) {
    return authError(err);
  }
}

export async function unbanUser(userId: string): Promise<ActionResult> {
  const admin = await adminForAction();
  if (!admin) return fail(NOT_ADMIN);
  const parsed = idSchema.safeParse(userId);
  if (!parsed.success) return fail("Invalid request.");
  try {
    await auth.api.unbanUser({ body: { userId: parsed.data }, headers: await headers() });
    await appendAudit({
      action: "admin.user_unbanned",
      actorId: admin.id,
      actorRole: "admin",
      entityType: "user",
      entityId: parsed.data,
      ip: await requestIp(),
    });
    revalidatePath("/admin/users");
    return ok(undefined);
  } catch (err) {
    return authError(err);
  }
}
