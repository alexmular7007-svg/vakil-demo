import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentUser, requireAdmin, type CurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema";

/**
 * The session (with Better Auth's 5-minute cookie cache) says who the user is; the
 * database says whether they are still an admin right now. Checking both means a
 * demoted or banned admin loses access immediately, not when the cache expires.
 */
const adminStatus = cache(async (userId: string): Promise<"ok" | "not_admin" | "needs_2fa"> => {
  const [row] = await db
    .select({ role: userTable.role, banned: userTable.banned, twoFactorEnabled: userTable.twoFactorEnabled })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  if (!row || row.banned || !can(row, "admin.console")) return "not_admin";
  // Production admins must use two-factor login (ADMIN_REQUIRE_2FA overrides).
  if (env.adminRequires2fa && !row.twoFactorEnabled) return "needs_2fa";
  return "ok";
});

/** For admin pages (inside Suspense): redirects non-admins away. */
export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await requireAdmin();
  const status = await adminStatus(user.id);
  if (status === "needs_2fa") redirect("/app/settings/security?require=2fa");
  if (status !== "ok") redirect("/app");
  return user;
}

/**
 * For admin server actions: the verified session user if they are an admin, else null.
 * Server actions are public endpoints, so every admin action calls this first.
 */
export async function adminForAction(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user || !can(user, "admin.console")) return null;
  if ((await adminStatus(user.id)) !== "ok") return null;
  return user;
}

export const NOT_ADMIN = "You need administrator access (with two-factor login in production) for this.";
