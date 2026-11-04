import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { CheckCircle2, MailWarning } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema";
import { Badge } from "@/components/ui/display";
import { ProfileForm } from "@/components/settings/profile-form";
import { SettingsSection } from "@/components/settings/section";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

const roleLabel = { user: "Member", advocate: "Verified advocate", admin: "Administrator" } as const;

export default async function ProfileSettingsPage() {
  const user = await requireUser("/app/settings");
  // Own row only (id from the verified session); app_user cannot read app.user.
  const [row] = await db
    .select({ phone: userTable.phone, createdAt: userTable.createdAt })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1);

  return (
    <div className="space-y-6">
      <SettingsSection title="Profile" description="How your name appears on drafts, e-sign envelopes and consultation requests.">
        <ProfileForm
          defaults={{
            name: user.name,
            email: user.email,
            phone: row?.phone ?? "",
            locale: user.locale,
            persona: user.persona,
          }}
        />
      </SettingsSection>

      <SettingsSection title="Account">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Email status</dt>
            <dd className="mt-1">
              {user.emailVerified ? (
                <Badge tone="success">
                  <CheckCircle2 /> Verified
                </Badge>
              ) : (
                <Badge tone="warning">
                  <MailWarning /> Not verified
                </Badge>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Account type</dt>
            <dd className="mt-1 font-medium text-ink">{roleLabel[user.role]}</dd>
          </div>
          <div>
            <dt className="text-muted">Member since</dt>
            <dd className="mt-1 font-medium text-ink">{formatDate(row?.createdAt)}</dd>
          </div>
        </dl>
      </SettingsSection>
    </div>
  );
}
