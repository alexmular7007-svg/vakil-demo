import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";
import { can, toRole, type Permission, type Role } from "./permissions";

export type { Role };

/** The narrow user object shared with the UI. Never pass the raw session around. */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  locale: string;
  persona: string;
  twoFactorEnabled: boolean;
  image: string | null;
};

/** Verified session for this request (signature and expiry checked by Better Auth). */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await getSession();
  if (!s?.user) return null;
  const u = s.user as typeof s.user & {
    role?: string | null;
    locale?: string | null;
    persona?: string | null;
    banned?: boolean | null;
    twoFactorEnabled?: boolean | null;
  };
  if (u.banned) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    role: toRole(u.role),
    locale: u.locale ?? "en",
    persona: u.persona ?? "advocate",
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    image: u.image ?? null,
  };
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  return requirePermission("admin.console", "/admin");
}

/** For pages: the signed-in user if they have the permission, else a redirect. */
export async function requirePermission(permission: Permission, next?: string): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (!can(user, permission)) redirect("/app");
  return user;
}

/** For server actions and route handlers: returns null instead of redirecting. */
export async function currentUserOrNull() {
  return getCurrentUser();
}

export async function requestIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
