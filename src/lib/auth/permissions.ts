// Who may do what. One place to read and change access rules; pages, server actions
// and route handlers ask `can(user, permission)` instead of comparing role strings.
// Adding a role (e.g. "junior" or "clerk") means adding it to ROLES and to the
// permissions it should have. Pure data and functions: safe for client components.

export const ROLES = ["user", "advocate", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  user: "Member",
  advocate: "Advocate",
  admin: "Administrator",
};

export const PERMISSIONS = {
  // Admin console
  "admin.console": ["admin"],
  "admin.users": ["admin"],
  "admin.verifications": ["admin"],
  "admin.library": ["admin"],
  "admin.updates": ["admin"],
  "admin.billing": ["admin"],
  "admin.audit": ["admin"],
  "admin.kyc": ["admin"],
  // Advocate features
  "advocate.inbox": ["advocate", "admin"],
  // Paid content that admins can always see (subscribers get it through entitlements)
  "updates.always": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/** Normalises a stored role; unknown or missing values become the least-privileged role. */
export function toRole(v: unknown): Role {
  return isRole(v) ? v : "user";
}

export function can(user: { role?: string | null } | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(toRole(user.role));
}
