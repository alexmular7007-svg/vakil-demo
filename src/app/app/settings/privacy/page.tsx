import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Download, Mail } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { consents, rightsRequests } from "@/lib/db/schema";
import { consentPurposes, RIGHTS_RESPONSE_DAYS } from "@/lib/privacy";
import { site } from "@/lib/site";
import { Alert, Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { MarketingConsentSwitch, RightsRequestForm } from "@/components/settings/privacy-controls";
import { SettingsSection } from "@/components/settings/section";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Privacy" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const statusTone = { open: "warning", in_progress: "info", resolved: "success", rejected: "danger" } as const;
const statusLabel = { open: "Open", in_progress: "In progress", resolved: "Resolved", rejected: "Declined" } as const;
const typeLabel: Record<string, string> = {
  access: "Access",
  correction: "Correction",
  erasure: "Erasure",
  withdraw_consent: "Withdraw consent",
  grievance: "Grievance",
};

export default async function PrivacySettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser("/app/settings/privacy");
  const sp = await searchParams;
  const requested = Array.isArray(sp.request) ? sp.request[0] : sp.request;
  const initialType = requested === "erasure" || requested === "correction" || requested === "grievance" ? requested : "access";

  const { consentRows, requests } = await withUser(user.id, async (tx) => ({
    consentRows: await tx.select().from(consents).orderBy(desc(consents.grantedAt)),
    requests: await tx.select().from(rightsRequests).orderBy(desc(rightsRequests.createdAt)).limit(50),
  }));

  const latest = (purpose: string) => consentRows.find((c) => c.purpose === purpose && !c.withdrawnAt) ?? null;
  const service = latest("service");
  const ai = latest("ai_processing");
  const marketing = latest("marketing");

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Your consents"
        description="Under the Digital Personal Data Protection Act, 2023 you can see and withdraw the consents you gave."
      >
        <ul className="divide-y divide-border rounded-lg border border-border">
          <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-ink">Running the service</p>
              <p className="text-sm text-muted">{consentPurposes.service}</p>
              <p className="mt-1 text-xs text-muted">
                {service ? `Given ${formatDate(service.grantedAt)} · notice ${service.noticeVersion}` : "Not recorded"}
              </p>
            </div>
            <Badge tone={service ? "success" : "warning"} className="self-start">
              {service ? "Active" : "Missing"}
            </Badge>
          </li>
          <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-ink">AI processing</p>
              <p className="text-sm text-muted">{consentPurposes.ai_processing}</p>
              <p className="mt-1 text-xs text-muted">
                {ai ? `Given ${formatDate(ai.grantedAt)} · notice ${ai.noticeVersion}` : "Not recorded"}
              </p>
            </div>
            <Badge tone={ai ? "success" : "warning"} className="self-start">
              {ai ? "Active" : "Missing"}
            </Badge>
          </li>
          <li className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-medium text-ink">Product update emails</p>
              <p className="text-sm text-muted">{consentPurposes.marketing}</p>
              <p className="mt-1 text-xs text-muted">{marketing ? `Given ${formatDate(marketing.grantedAt)}` : "Not given"}</p>
            </div>
            <MarketingConsentSwitch granted={Boolean(marketing)} />
          </li>
        </ul>
        <Alert tone="info" className="mt-4" title="Withdrawing consent to run the service">
          Vaakil AI cannot store your matters or answer questions without the first two consents, so withdrawing them means
          closing your account.{" "}
          <Link href="/app/settings/privacy?request=erasure#rights" className="font-medium text-primary underline">
            Ask us to close your account and erase your data
          </Link>
          .
        </Alert>
      </SettingsSection>

      <SettingsSection
        title="Download my data"
        description="A machine-readable JSON copy of your profile, matters, conversations, drafts, documents (text and metadata), consultations, e-sign envelopes, usage, billing and privacy records."
        actions={
          <Button asChild variant="outline" size="sm">
            <a href="/api/privacy/export" download>
              <Download /> Download JSON
            </a>
          </Button>
        }
      />

      <SettingsSection
        id="rights"
        title="Make a request"
        description={`Access, correction, erasure or a grievance. We respond within ${RIGHTS_RESPONSE_DAYS} days.`}
      >
        <RightsRequestForm key={initialType} initialType={initialType} />
      </SettingsSection>

      <SettingsSection title="Your requests">
        {requests.length === 0 ? (
          <p className="text-sm text-muted">You have not made any requests.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">
                    {typeLabel[r.type] ?? r.type} <span className="font-mono text-xs text-muted">ref {r.id.slice(0, 8).toUpperCase()}</span>
                  </p>
                  <Badge tone={statusTone[r.status as keyof typeof statusTone] ?? "neutral"}>
                    {statusLabel[r.status as keyof typeof statusLabel] ?? r.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{r.details}</p>
                <p className="mt-2 text-xs text-muted">
                  Filed {formatDate(r.createdAt)} · {r.resolvedAt ? `closed ${formatDate(r.resolvedAt)}` : `due by ${formatDate(r.dueAt)}`}
                </p>
                {r.response ? (
                  <div className="mt-3 rounded-md bg-surface-2 p-3 text-sm text-ink-2">
                    <p className="text-xs font-medium text-muted">Our response</p>
                    <p className="mt-1 whitespace-pre-line">{r.response}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection title="Grievance Officer">
        <p className="text-sm text-ink-2">
          If you are not satisfied with how we handled your data or a request, write to our Grievance Officer. You may also
          complain to the Data Protection Board of India once we have responded or the response period has passed.
        </p>
        <Button asChild variant="link" className="mt-2">
          <a href={`mailto:${site.grievanceEmail}`}>
            <Mail /> {site.grievanceEmail}
          </a>
        </Button>
      </SettingsSection>
    </div>
  );
}
