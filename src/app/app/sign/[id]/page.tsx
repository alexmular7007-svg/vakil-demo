import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, BadgeCheck, Download, ExternalLink, FileText, History, ListOrdered, ScanLine, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui/display";
import { ChainVerify } from "@/components/esign/chain-verify";
import { HashValue } from "@/components/esign/hash-value";
import { Tier2Notice } from "@/components/esign/legal-notice";
import { OwnerActions } from "@/components/esign/owner-actions";
import { RoutingTimeline } from "@/components/esign/routing-timeline";
import { EnvelopeStatusBadge, RecipientStatusBadge } from "@/components/esign/status-badge";
import { requireUser } from "@/lib/auth/dal";
import { actionLabels, findCategory, roleLabels, type RecipientAction, type RoleLabel } from "@/lib/esign/constants";
import { eventLabel, formatIst, maskEmail, shortHash } from "@/lib/esign/format";
import { getEnvelopeDetail } from "@/lib/esign/queries";
import { envelopeIdSchema } from "@/lib/esign/schemas";
import { allActionableDone, currentOrder, initialRecipientsToNotify, isActionable, isDone, isInFlight, undeliveredRecipientIds } from "@/lib/esign/workflow";

export const metadata: Metadata = { title: "Envelope" };

function eventDetail(type: string, data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  if (type === "recipient.declined" || type === "envelope.voided") return typeof d.reason === "string" ? `Reason: ${d.reason}` : null;
  if (type === "recipient.notified") {
    const reasons: Record<string, string> = { initial: "first send", next_order: "their turn", reminder: "reminder", final_copy: "final copy" };
    return typeof d.reason === "string" ? `Why: ${reasons[d.reason] ?? d.reason}` : null;
  }
  if (type === "order.completed") return typeof d.routingOrder === "number" ? `Step ${d.routingOrder}` : null;
  if (type === "consent.accepted") return typeof d.consentVersion === "string" ? `Consent text ${d.consentVersion}` : null;
  if (type === "recipient.signed") return typeof d.signatureKind === "string" ? `${d.signatureKind === "typed" ? "Typed" : "Drawn"} signature` : null;
  if (type === "email.failed") {
    const kinds: Record<string, string> = {
      initial: "signing link",
      next_order: "signing link",
      reminder: "reminder link",
      final_copy: "final copy link",
      voided: "cancellation notice",
      declined_notice: "decline notice to you",
      expired_notice: "expiry notice to you",
      completed_notice: "completion notice to you",
    };
    return typeof d.kind === "string" ? `What: ${kinds[d.kind] ?? d.kind}` : null;
  }
  if (type === "document.integrity_failed") return typeof d.file === "string" ? `File: ${d.file}` : null;
  return null;
}

export default async function EnvelopePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("/app/sign");
  await connection();
  const { id } = await params;
  const parsed = envelopeIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  // getEnvelopeDetail applies expiry first, so an overdue envelope shows as expired.
  const detail = await getEnvelopeDetail(user.id, parsed.data);
  if (!detail) notFound();

  const { envelope, recipients, events } = detail;
  const status = envelope.status;
  const inFlight = isInFlight(status);
  const nameById = new Map(recipients.map((r) => [r.id, r.name]));
  const order = currentOrder(recipients);
  const canRemind = inFlight && recipients.some((r) => isActionable(r) && !isDone(r) && r.routingOrder === order);
  const needsCompletion = inFlight && allActionableDone(recipients);
  const firstStep = initialRecipientsToNotify(recipients).map((r) => r.name);
  const declined = recipients.find((r) => r.status === "DECLINED");
  const undelivered = new Set(undeliveredRecipientIds(events));
  const undeliveredNames = recipients.filter((r) => undelivered.has(r.id)).map((r) => r.name);
  const category = findCategory(envelope.docCategory);
  const dl = (file: "original" | "final", download = false) =>
    `/api/esign/envelopes/${envelope.id}/download?file=${file}${download ? "&download=1" : ""}`;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3 h-10">
        <Link href="/app/sign">
          <ArrowLeft aria-hidden /> E-Sign
        </Link>
      </Button>
      <PageHeader
        title={<span className="break-words">{envelope.title}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <EnvelopeStatusBadge status={status} />
            <span>{category?.label ?? envelope.docCategory}</span>
            <span aria-hidden>·</span>
            <span>Created {formatIst(envelope.createdAt)}</span>
          </span>
        }
        actions={
          <OwnerActions
            envelopeId={envelope.id}
            status={status}
            firstStepNames={firstStep}
            canRemind={canRemind}
            needsCompletion={needsCompletion}
          />
        }
      />

      <div className="mb-5 space-y-3">
        {status === "DRAFT" ? (
          <Alert tone="info" title="Review before sending">
            Open the PDF and check every page, then check the recipients and the order below. When you press Send, the PDF’s SHA-256 is locked and
            step one is emailed. To change anything, delete this draft and create a new one.
          </Alert>
        ) : null}
        {undeliveredNames.length > 0 ? (
          <Alert tone="warning" title="Some emails were not delivered">
            The latest link for <span data-private>{undeliveredNames.join(", ")}</span> could not be emailed.
            {inFlight && canRemind ? " Use “Send reminder” to issue a fresh link." : " Check the address, or contact them directly."}
          </Alert>
        ) : null}
        {needsCompletion ? (
          <Alert tone="warning" title="Everyone has finished, but the final PDF was not built">
            Press “Finish completion” to build the certificate of completion and email the final copy.
          </Alert>
        ) : null}
        {status === "DECLINED" ? (
          <Alert tone="danger" title={declined ? `Declined by ${declined.name}` : "Declined"}>
            {declined?.declineReason ? <>Reason: {declined.declineReason}</> : "The envelope is closed."} To try again, create a new envelope.
          </Alert>
        ) : null}
        {status === "EXPIRED" ? (
          <Alert tone="warning" title="Expired">
            It expired at {formatIst(envelope.expiresAt)} before everyone finished. Create a new envelope to continue.
          </Alert>
        ) : null}
        {status === "VOIDED" ? <Alert tone="warning" title="Voided">You cancelled this envelope. Links no longer work; the audit trail is kept.</Alert> : null}
        {status === "COMPLETED" ? (
          <Alert tone="success" title={`Completed ${formatIst(envelope.completedAt)}`}>
            Every party has been emailed a personal link to the final PDF, which includes the signature page and certificate of completion.
          </Alert>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="size-4 text-primary" aria-hidden /> Progress
              </CardTitle>
              <CardDescription>Equal step numbers run at the same time; later steps wait.</CardDescription>
            </CardHeader>
            <CardContent>
              <RoutingTimeline recipients={recipients} status={status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-primary" aria-hidden /> Recipients
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border border-t border-border">
                {recipients.map((r) => (
                  <li key={r.id} className="space-y-2 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                          <span className="break-words">{r.name}</span>
                          {r.advocateUserId ? (
                            <Badge tone="primary">
                              <BadgeCheck aria-hidden /> Verified advocate
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-[13px] break-all text-muted">{r.advocateUserId ? maskEmail(r.email) : r.email}</p>
                      </div>
                      <RecipientStatusBadge status={r.status} action={r.action} />
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-4">
                      <div>
                        <dt className="text-muted">Role</dt>
                        <dd className="text-ink-2">{roleLabels[r.roleLabel as RoleLabel] ?? r.roleLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Action</dt>
                        <dd className="text-ink-2">{actionLabels[r.action as RecipientAction] ?? r.action}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Step</dt>
                        <dd className="text-ink-2">{r.action === "CC" ? "At end" : r.routingOrder}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Auth</dt>
                        <dd className="text-ink-2">{r.action === "CC" ? "None" : "Email OTP"}</dd>
                      </div>
                      {r.actedAt ? (
                        <div className="col-span-2">
                          <dt className="text-muted">{r.status === "DECLINED" ? "Declined" : "Acted"}</dt>
                          <dd className="text-ink-2">{formatIst(r.actedAt)}</dd>
                        </div>
                      ) : null}
                      {r.ip ? (
                        <div>
                          <dt className="text-muted">IP</dt>
                          <dd className="break-all text-ink-2">{r.ip}</dd>
                        </div>
                      ) : null}
                      {r.signatureKind ? (
                        <div className="col-span-2 sm:col-span-4">
                          <dt className="text-muted">Signature</dt>
                          <dd className="text-ink-2">
                            {r.signatureKind === "typed" ? (
                              <span className="font-serif text-base italic">{r.signatureText}</span>
                            ) : (
                              "Drawn (image in the certificate of completion)"
                            )}
                          </dd>
                        </div>
                      ) : null}
                      {r.declineReason ? (
                        <div className="col-span-2 sm:col-span-4">
                          <dt className="text-muted">Reason</dt>
                          <dd className="text-ink-2">{r.declineReason}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <History className="size-4 text-primary" aria-hidden /> Audit trail
                </CardTitle>
                <CardDescription>Append-only. Each event’s hash covers the previous one, so any edit, deletion or reordering shows.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {events.length === 0 ? (
                <p className="text-sm text-muted">
                  Events start when the envelope is sent. (Draft creation is recorded in your account’s audit log.)
                </p>
              ) : (
                <>
                  <ChainVerify envelopeId={envelope.id} />
                  <ol className="space-y-3">
                    {events.map((e) => {
                      const detailText = eventDetail(e.type, e.data);
                      return (
                        <li key={e.seq} className="relative rounded-md border border-border p-3 text-[13px]">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <p className="font-medium text-ink">
                              <span className="mr-1.5 font-mono text-xs text-muted">#{e.seq}</span>
                              {eventLabel(e.type)}
                            </p>
                            <time dateTime={e.createdAt.toISOString()} className="text-xs text-muted">
                              {formatIst(e.createdAt)}
                            </time>
                          </div>
                          <p className="mt-1 text-ink-2">
                            {e.recipientId ? (nameById.get(e.recipientId) ?? "Recipient") : "System or sender"}
                            {e.ip ? <span className="text-muted"> · IP {e.ip}</span> : null}
                            {detailText ? <span className="text-muted"> · {detailText}</span> : null}
                          </p>
                          <p className="mt-1 font-mono text-[11px] break-all text-muted">
                            {e.documentSha256 ? <>doc {shortHash(e.documentSha256)} · </> : null}hash {shortHash(e.hash)}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-primary" aria-hidden /> Document
              </CardTitle>
              <CardDescription className="break-words">{envelope.originalName}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="h-10">
                  <a href={dl("original")} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden /> Open original
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
                {envelope.finalStorageKey ? (
                  <Button asChild size="sm" className="h-10">
                    <a href={dl("final", true)}>
                      <Download aria-hidden /> Final PDF
                    </a>
                  </Button>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted">Original SHA-256 (at upload)</p>
                <HashValue value={envelope.originalSha256} label="original SHA-256" />
              </div>
              {envelope.lockedSha256 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted">Locked SHA-256 ({formatIst(envelope.lockedAt)})</p>
                  <HashValue value={envelope.lockedSha256} label="locked SHA-256" />
                </div>
              ) : null}
              {envelope.finalSha256 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted">Final SHA-256 (with certificate)</p>
                  <HashValue value={envelope.finalSha256} label="final SHA-256" />
                </div>
              ) : null}
              <dl className="grid gap-2 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{status === "DRAFT" ? "Expires (from send)" : "Expires"}</dt>
                  <dd className="text-right text-ink-2">
                    {status === "DRAFT"
                      ? `${Math.max(1, Math.round((envelope.expiresAt.getTime() - envelope.createdAt.getTime()) / 86_400_000))} days`
                      : formatIst(envelope.expiresAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Signature type</dt>
                  <dd className="text-right text-ink-2">{envelope.signatureType === "aadhaar" ? "Aadhaar eSign (aggregator)" : "Tier-2 electronic"}</dd>
                </div>
              </dl>
              {status !== "DRAFT" ? (
                <Button asChild variant="ghost" size="sm" className="-ml-2 h-10">
                  <Link href={`/verify/${envelope.id}`} target="_blank">
                    <ScanLine aria-hidden /> Public verification page
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
          {envelope.message ? (
            <Card>
              <CardHeader>
                <CardTitle>Message to recipients</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line text-ink-2">{envelope.message}</p>
              </CardContent>
            </Card>
          ) : null}
          <Tier2Notice compact />
        </div>
      </div>
    </div>
  );
}
