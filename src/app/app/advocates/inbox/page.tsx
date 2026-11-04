import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Inbox, MessageSquareText, Send } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { db, withUser } from "@/lib/db";
import { advocateProfiles, consultations, user as userTable } from "@/lib/db/schema";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { RespondButtons, WithdrawButton } from "@/components/directory/consultation-actions";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Consultations" };

const statusTone = { requested: "warning", accepted: "success", declined: "danger", closed: "neutral" } as const;
const statusLabel = { requested: "Awaiting reply", accepted: "Accepted", declined: "Declined", closed: "Closed" } as const;

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={statusTone[status as keyof typeof statusTone] ?? "neutral"}>
      {statusLabel[status as keyof typeof statusLabel] ?? status}
    </Badge>
  );
}

export default async function ConsultationInboxPage() {
  const user = await requireUser("/app/advocates/inbox");

  // RLS: only consultations where the caller is the requester or the advocate.
  const { rows, me } = await withUser(user.id, async (tx) => ({
    rows: await tx.select().from(consultations).orderBy(desc(consultations.createdAt)).limit(200),
    me: (
      await tx
        .select({ status: advocateProfiles.verificationStatus, accepts: advocateProfiles.acceptsConsultations })
        .from(advocateProfiles)
        .where(eq(advocateProfiles.userId, user.id))
        .limit(1)
    )[0],
  }));

  const received = rows.filter((r) => r.advocateId === user.id);
  const sent = rows.filter((r) => r.requesterId === user.id);
  const isVerified = me?.status === "verified";

  // Counterparty names, looked up only for ids that came from the caller's own rows.
  const requesterIds = [...new Set(received.map((r) => r.requesterId))];
  const advocateIds = [...new Set(sent.map((r) => r.advocateId))];
  const [requesters, advocates] = await Promise.all([
    requesterIds.length
      ? db.select({ id: userTable.id, name: userTable.name, email: userTable.email }).from(userTable).where(inArray(userTable.id, requesterIds))
      : Promise.resolve([]),
    advocateIds.length
      ? db
          .select({ id: advocateProfiles.userId, name: advocateProfiles.displayName })
          .from(advocateProfiles)
          .where(inArray(advocateProfiles.userId, advocateIds))
      : Promise.resolve([]),
  ]);
  const requesterById = new Map(requesters.map((r) => [r.id, r]));
  const advocateById = new Map(advocates.map((a) => [a.id, a.name]));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Consultations"
        description="Requests you have sent to advocates and, if you are a verified advocate, requests sent to you."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/advocates">Find an advocate</Link>
          </Button>
        }
      />

      {isVerified || received.length > 0 ? (
        <section aria-labelledby="received-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="size-5 text-muted" aria-hidden />
            <h2 id="received-heading" className="text-lg font-semibold text-ink">
              Requests to you
            </h2>
          </div>
          {isVerified && !me?.accepts ? (
            <Alert tone="info">
              You are not accepting new requests.{" "}
              <Link href="/app/settings/advocate" className="font-medium text-primary underline">
                Change this in your advocate profile
              </Link>
              .
            </Alert>
          ) : null}
          {!isVerified && received.length > 0 ? (
            <Alert tone="warning">Your verification is not active, so you cannot respond until it is restored.</Alert>
          ) : null}
          {received.length === 0 ? (
            <EmptyState icon={Inbox} title="No requests yet" description="When someone sends you a consultation request, it appears here and by email." />
          ) : (
            <ul className="space-y-3">
              {received.map((r) => {
                const who = requesterById.get(r.requesterId);
                return (
                  <li key={r.id} className="rounded-lg border border-border bg-surface p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium text-ink">{r.subject}</h3>
                        <p className="text-sm text-muted">
                          From {who?.name ?? "a Vaakil AI user"} · {formatDateTime(r.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-3 text-sm whitespace-pre-line text-ink-2">{r.summary}</p>
                    {r.chatId ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                        <MessageSquareText className="size-3.5" aria-hidden /> Linked to the requester&apos;s AI conversation (visible only to them).
                      </p>
                    ) : null}
                    {r.status === "accepted" && who ? (
                      <p className="mt-3 rounded-md bg-success-soft px-3 py-2 text-sm text-ink">
                        Contact: <a href={`mailto:${who.email}`} className="font-medium text-primary underline">{who.email}</a>
                      </p>
                    ) : null}
                    {r.advocateNote ? (
                      <p className="mt-3 text-sm text-ink-2">
                        <span className="text-muted">Your note:</span> {r.advocateNote}
                      </p>
                    ) : null}
                    {isVerified ? (
                      <div className="mt-4">
                        <RespondButtons id={r.id} status={r.status} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="sent-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <Send className="size-5 text-muted" aria-hidden />
          <h2 id="sent-heading" className="text-lg font-semibold text-ink">
            Your requests
          </h2>
        </div>
        {sent.length === 0 ? (
          <EmptyState
            icon={Send}
            title="You have not sent any requests"
            description="Find a verified advocate and send a short summary of your matter."
            action={
              <Button asChild size="sm">
                <Link href="/app/advocates">Browse advocates</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {sent.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium text-ink">{r.subject}</h3>
                    <p className="text-sm text-muted">
                      To {advocateById.get(r.advocateId) ?? "an advocate"} · {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-3 line-clamp-3 text-sm whitespace-pre-line text-ink-2">{r.summary}</p>
                {r.chatId ? (
                  <Link href={`/app/chat/${r.chatId}`} className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                    <MessageSquareText className="size-3.5" aria-hidden /> Linked conversation
                  </Link>
                ) : null}
                {r.advocateNote ? (
                  <div className="mt-3 rounded-md bg-surface-2 p-3 text-sm text-ink-2">
                    <p className="text-xs font-medium text-muted">Note from the advocate</p>
                    <p className="mt-1 whitespace-pre-line">{r.advocateNote}</p>
                  </div>
                ) : null}
                {r.status === "accepted" ? (
                  <p className="mt-3 text-sm text-ink-2">The advocate can see your email address and will contact you directly.</p>
                ) : null}
                {r.status === "requested" ? (
                  <div className="mt-3">
                    <WithdrawButton id={r.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
