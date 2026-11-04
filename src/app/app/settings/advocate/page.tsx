import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { BadgeCheck, Clock, Inbox, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { advocateProfiles } from "@/lib/db/schema";
import { Alert, Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { AdvocateForm } from "@/components/settings/advocate-form";
import { SettingsSection } from "@/components/settings/section";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Advocate verification" };

export default async function AdvocateSettingsPage() {
  const user = await requireUser("/app/settings/advocate");
  const [profile] = await withUser(user.id, (tx) =>
    tx.select().from(advocateProfiles).where(eq(advocateProfiles.userId, user.id)).limit(1),
  );

  const status = profile?.verificationStatus ?? null;

  return (
    <div className="space-y-6">
      {profile ? (
        <SettingsSection
          title="Verification status"
          actions={
            status === "verified" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/app/advocates/inbox">
                  <Inbox /> Consultation inbox
                </Link>
              </Button>
            ) : null
          }
        >
          {status === "verified" ? (
            <Alert tone="success" title="Verified advocate">
              Verified on {formatDate(profile.verifiedAt)}. {profile.isListed ? "You are listed in the directory." : "You are not listed in the directory."}{" "}
              {profile.acceptsConsultations ? "You accept consultation requests." : "You are not accepting consultation requests."}
            </Alert>
          ) : status === "rejected" ? (
            <Alert tone="danger" title="Not verified">
              <p>{profile.rejectionReason ? `Reason: ${profile.rejectionReason}` : "No reason was given."}</p>
              <p className="mt-1">Correct the details below and resubmit, or write to us if you think this is a mistake.</p>
            </Alert>
          ) : (
            <Alert tone="info" title="Waiting for review">
              Submitted {formatDate(profile.createdAt)}. An administrator checks your enrolment against the State Bar Council
              roll. You will get an email with the result.
            </Alert>
          )}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="mt-1">
                {status === "verified" ? (
                  <Badge tone="success">
                    <BadgeCheck /> Verified
                  </Badge>
                ) : status === "rejected" ? (
                  <Badge tone="danger">
                    <XCircle /> Rejected
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <Clock /> Pending
                  </Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Enrolment number</dt>
              <dd className="mt-1 font-mono text-ink">{profile.enrolmentNo}</dd>
            </div>
            <div>
              <dt className="text-muted">Bar Council</dt>
              <dd className="mt-1 text-ink">{profile.stateBarCouncil}</dd>
            </div>
          </dl>
        </SettingsSection>
      ) : (
        <Alert tone="info" title="Are you an enrolled advocate?">
          Verified advocates get a badge, can act as the Lawyer on e-sign envelopes, and can choose to appear in the
          unranked advocate directory and receive consultation requests.
        </Alert>
      )}

      <SettingsSection
        title={profile ? "Your advocate profile" : "Apply for verification"}
        description="We check these details against the State Bar Council roll. Use the exact name and number on your Bar Council ID card."
      >
        <AdvocateForm
          status={status}
          defaults={
            profile
              ? {
                  displayName: profile.displayName,
                  enrolmentNo: profile.enrolmentNo,
                  stateBarCouncil: profile.stateBarCouncil,
                  enrolmentYear: profile.enrolmentYear,
                  practiceAreas: profile.practiceAreas,
                  courts: profile.courts,
                  languages: profile.languages,
                  city: profile.city ?? "",
                  state: profile.state ?? "",
                  bio: profile.bio ?? "",
                  isListed: profile.isListed,
                  acceptsConsultations: profile.acceptsConsultations,
                }
              : null
          }
        />
      </SettingsSection>
    </div>
  );
}
