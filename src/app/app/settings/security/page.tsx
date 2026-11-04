import type { Metadata } from "next";
import { and, desc, eq, gt } from "drizzle-orm";
import { getSession, requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { account, session as sessionTable, user as userTable } from "@/lib/db/schema";
import { Alert } from "@/components/ui/display";
import { PasswordForm } from "@/components/settings/password-form";
import { SessionsList, type SessionView } from "@/components/settings/sessions-list";
import { SettingsSection } from "@/components/settings/section";
import { TwoFactorCard } from "@/components/settings/two-factor-card";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Security" };

function describeAgent(ua: string | null): { device: string; mobile: boolean } {
  if (!ua) return { device: "Unknown device", mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iOS/.test(ua)
      ? "iOS"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return { device: os ? `${browser} on ${os}` : browser, mobile };
}

export default async function SecuritySettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/settings/security");
  const required = (await searchParams).require === "2fa";
  const current = await getSession();
  // Own rows only (user id from the verified session). Session tokens never leave the server.
  const [[me], rows, credential] = await Promise.all([
    db.select({ twoFactorEnabled: userTable.twoFactorEnabled }).from(userTable).where(eq(userTable.id, user.id)).limit(1),
    db
      .select({
        id: sessionTable.id,
        userAgent: sessionTable.userAgent,
        ipAddress: sessionTable.ipAddress,
        createdAt: sessionTable.createdAt,
        updatedAt: sessionTable.updatedAt,
      })
      .from(sessionTable)
      .where(and(eq(sessionTable.userId, user.id), gt(sessionTable.expiresAt, new Date())))
      .orderBy(desc(sessionTable.updatedAt))
      .limit(50),
    db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, user.id), eq(account.providerId, "credential")))
      .limit(1),
  ]);

  const sessions: SessionView[] = rows
    .map((r) => {
      const { device, mobile } = describeAgent(r.userAgent);
      return {
        id: r.id,
        device,
        mobile,
        ip: r.ipAddress,
        createdAt: formatDateTime(r.createdAt),
        lastActive: formatDateTime(r.updatedAt),
        current: r.id === current?.session.id,
      };
    })
    .sort((a, b) => Number(b.current) - Number(a.current));

  const hasPassword = credential.length > 0;
  const twoFactorOn = Boolean(me?.twoFactorEnabled);

  return (
    <div className="space-y-6">
      <SettingsSection title="Password" description="Use a long passphrase you do not use anywhere else.">
        {hasPassword ? (
          <PasswordForm />
        ) : (
          <Alert tone="info">This account signs in without a password, so there is nothing to change here.</Alert>
        )}
      </SettingsSection>

      <SettingsSection
        title="Two-factor sign-in"
        description="Strongly recommended for advocates: your matters and client documents stay safe even if your password leaks."
      >
        {hasPassword ? (
          <TwoFactorCard enabled={twoFactorOn} />
        ) : (
          <Alert tone="info">Two-factor sign-in needs a password on the account.</Alert>
        )}
        {user.role === "admin" && !twoFactorOn ? (
          <Alert tone={required ? "danger" : "warning"} className="mt-4" title={required ? "Turn on two-factor sign-in to open the admin console" : "Administrators should turn this on"}>
            Admin accounts can change roles and see audit records, so the admin console requires an authenticator app in production. Turn it on
            above, then open the admin console again.
          </Alert>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Where you are signed in" description="Sign out of any device you do not recognise, then change your password.">
        <SessionsList sessions={sessions} />
      </SettingsSection>
    </div>
  );
}
