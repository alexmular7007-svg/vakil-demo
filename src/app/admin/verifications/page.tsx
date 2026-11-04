import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { AlertTriangle, BadgeCheck } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { advocateProfiles, user as userTable } from "@/lib/db/schema";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { VerificationActions } from "@/components/admin/verification-actions";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Advocate verification" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const tabs = [
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
] as const;

export default async function AdminVerificationsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = raw === "verified" || raw === "rejected" ? raw : "pending";

  const [rows, counts] = await Promise.all([
    db
      .select({
        userId: advocateProfiles.userId,
        displayName: advocateProfiles.displayName,
        enrolmentNo: advocateProfiles.enrolmentNo,
        stateBarCouncil: advocateProfiles.stateBarCouncil,
        enrolmentYear: advocateProfiles.enrolmentYear,
        practiceAreas: advocateProfiles.practiceAreas,
        courts: advocateProfiles.courts,
        languages: advocateProfiles.languages,
        city: advocateProfiles.city,
        state: advocateProfiles.state,
        bio: advocateProfiles.bio,
        isListed: advocateProfiles.isListed,
        acceptsConsultations: advocateProfiles.acceptsConsultations,
        verifiedAt: advocateProfiles.verifiedAt,
        verifiedBy: advocateProfiles.verifiedBy,
        rejectionReason: advocateProfiles.rejectionReason,
        createdAt: advocateProfiles.createdAt,
        updatedAt: advocateProfiles.updatedAt,
        email: userTable.email,
        accountName: userTable.name,
        emailVerified: userTable.emailVerified,
        accountCreated: userTable.createdAt,
      })
      .from(advocateProfiles)
      .innerJoin(userTable, eq(userTable.id, advocateProfiles.userId))
      .where(eq(advocateProfiles.verificationStatus, status))
      .orderBy(status === "pending" ? asc(advocateProfiles.updatedAt) : desc(advocateProfiles.updatedAt))
      .limit(100),
    db
      .select({ status: advocateProfiles.verificationStatus, n: count() })
      .from(advocateProfiles)
      .groupBy(advocateProfiles.verificationStatus),
  ]);
  const countBy = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));

  // Same enrolment number claimed under the same council by more than one account.
  const keys = rows.map((r) => r.enrolmentNo);
  const dupes = keys.length
    ? await db
        .select({ enrolmentNo: advocateProfiles.enrolmentNo, council: advocateProfiles.stateBarCouncil, n: count() })
        .from(advocateProfiles)
        .where(inArray(advocateProfiles.enrolmentNo, keys))
        .groupBy(advocateProfiles.enrolmentNo, advocateProfiles.stateBarCouncil)
        .having(sql`count(*) > 1`)
    : [];
  const dupeKey = new Map(dupes.map((d) => [`${d.enrolmentNo}|${d.council}`, Number(d.n)]));

  const reviewerIds = [...new Set(rows.map((r) => r.verifiedBy).filter((v): v is string => Boolean(v)))];
  const reviewers = reviewerIds.length
    ? await db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(and(inArray(userTable.id, reviewerIds)))
    : [];
  const reviewerName = new Map(reviewers.map((r) => [r.id, r.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Advocate verification"
        description="Check each enrolment number and name against the State Bar Council roll before approving. Every decision is audited and emailed to the advocate."
      />

      <nav aria-label="Verification status" className="flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1 sm:w-fit">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={`/admin/verifications?status=${t.value}`}
            aria-current={status === t.value ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
              status === t.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            <span className="rounded-full bg-surface-2 px-1.5 text-xs tabular-nums">{countBy[t.value] ?? 0}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={BadgeCheck} title={status === "pending" ? "The queue is empty" : `No ${status} profiles`} />
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const dupeCount = dupeKey.get(`${r.enrolmentNo}|${r.stateBarCouncil}`);
            return (
              <li key={r.userId} className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-ink">{r.displayName}</h2>
                    <p className="text-sm text-muted">
                      Account: {r.accountName} · {r.email}{" "}
                      {r.emailVerified ? <Badge tone="success">email verified</Badge> : <Badge tone="warning">email unverified</Badge>}
                    </p>
                  </div>
                  {status !== "rejected" ? (
                    <VerificationActions userId={r.userId} name={r.displayName} mode={status === "pending" ? "pending" : "verified"} />
                  ) : null}
                </div>

                {dupeCount ? (
                  <Alert tone="warning" className="mt-3">
                    <span className="inline-flex items-center gap-1.5">
                      <AlertTriangle className="size-4" aria-hidden /> This enrolment number is claimed by {dupeCount} accounts under the same Bar
                      Council. Check carefully.
                    </span>
                  </Alert>
                ) : null}

                <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-muted">Enrolment number</dt>
                    <dd className="font-mono text-ink">{r.enrolmentNo}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">State Bar Council</dt>
                    <dd className="text-ink">{r.stateBarCouncil}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Year of enrolment</dt>
                    <dd className="text-ink">{r.enrolmentYear ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Location</dt>
                    <dd className="text-ink">{[r.city, r.state].filter(Boolean).join(", ") || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Practice areas</dt>
                    <dd className="text-ink">{r.practiceAreas.join(", ") || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Languages</dt>
                    <dd className="text-ink">{r.languages.join(", ") || "—"}</dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-muted">Courts</dt>
                    <dd className="text-ink">{r.courts.join(" · ") || "—"}</dd>
                  </div>
                  {r.bio ? (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <dt className="text-muted">About</dt>
                      <dd className="whitespace-pre-line text-ink-2">{r.bio}</dd>
                    </div>
                  ) : null}
                </dl>

                <p className="mt-4 text-xs text-muted">
                  Submitted {formatDateTime(r.createdAt)} · last changed {formatDateTime(r.updatedAt)} · account since {formatDate(r.accountCreated)} ·{" "}
                  {r.isListed ? "wants to be listed" : "not listed"} · {r.acceptsConsultations ? "accepts consultations" : "no consultations"}
                  {r.verifiedAt ? ` · verified ${formatDate(r.verifiedAt)}${r.verifiedBy ? ` by ${reviewerName.get(r.verifiedBy) ?? "an admin"}` : ""}` : ""}
                </p>
                {r.rejectionReason ? <p className="mt-2 text-sm text-danger">Reason given: {r.rejectionReason}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
