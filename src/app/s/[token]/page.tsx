import Link from "next/link";
import { connection } from "next/server";
import { Ban, CheckCircle2, Clock, Download, ExternalLink, Hourglass, Link2Off, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/display";
import { HashValue } from "@/components/esign/hash-value";
import { Tier2Notice } from "@/components/esign/legal-notice";
import { SignerFlow } from "@/components/esign/signer-flow";
import { EnvelopeStatusBadge } from "@/components/esign/status-badge";
import { FinalCopyAccess } from "@/components/esign/final-copy-access";
import { actionLabels, roleLabels, type RecipientAction, type RoleLabel } from "@/lib/esign/constants";
import { formatIst } from "@/lib/esign/format";
import { tokenSchema } from "@/lib/esign/schemas";
import { getSignerView } from "@/lib/esign/signer";

function InvalidLink() {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <CardContent className="space-y-3 p-8">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
          <Link2Off className="size-5" aria-hidden />
        </span>
        <h1 className="font-serif text-xl font-semibold text-ink">This link does not work</h1>
        <p className="text-sm text-muted">
          It may be mistyped, or a newer email has replaced it (each reminder issues a fresh link). Open the latest email you received about
          this document, or ask the sender to resend it.
        </p>
      </CardContent>
    </Card>
  );
}

export default async function SignerPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!tokenSchema.safeParse(token).success) return <InvalidLink />;
  const view = await getSignerView(token);
  if (!view) return <InvalidLink />;

  // `details` (title, message, file, fingerprints, progress) exists only after the
  // email one-time code; before that the page shows the sender and the signer's own role.
  const { envelope, me, details } = view;
  const roleText = roleLabels[me.roleLabel as RoleLabel] ?? me.roleLabel;
  const actionText = actionLabels[me.action as RecipientAction] ?? me.action;
  const myDone = me.status === "APPROVED" || me.status === "SIGNED";
  const signerAction = me.action === "REVIEW" || me.action === "SIGN" || me.action === "WITNESS" ? me.action : null;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm text-muted">
          From <span className="font-medium text-ink-2">{envelope.ownerName}</span>
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance text-ink sm:text-[28px]">
          {details ? details.title : "A document for you"}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <EnvelopeStatusBadge status={envelope.status} />
          <Badge tone="outline">
            You: {roleText} · {actionText}
          </Badge>
          {details ? (
            <Badge tone="neutral">
              {details.progress.done} of {details.progress.total} done
            </Badge>
          ) : null}
        </div>
        {!details && view.canVerify ? (
          <p className="text-[13px] text-muted">The title, the document and everything else on it appear once you confirm your email.</p>
        ) : null}
      </div>

      {details?.message && view.canAct ? (
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="mb-1 font-medium text-ink">Message from {envelope.ownerName}</p>
            <p className="whitespace-pre-line text-ink-2">{details.message}</p>
          </CardContent>
        </Card>
      ) : null}

      {envelope.status === "COMPLETED" ? (
        details ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" aria-hidden /> Everyone has finished
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-ink-2">
                Completed {formatIst(details.completedAt)}. Your copy includes a signature page and certificate of completion.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={`/s/${token}/final?download=1`}>
                    <Download aria-hidden /> Download signed copy
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`/s/${token}/final`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden /> Open
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
              </div>
              {details.finalSha256 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted">Final document SHA-256</p>
                  <HashValue value={details.finalSha256} label="final document SHA-256" />
                  <p className="text-[13px] text-muted">
                    Anyone can check a copy at{" "}
                    <Link href={`/verify/${details.id}`} className="text-primary underline underline-offset-2">
                      the public verification page
                    </Link>
                    .
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <FinalCopyAccess token={token} maskedEmail={me.maskedEmail} />
        )
      ) : envelope.status === "VOIDED" ? (
        <Alert tone="warning" title="The sender cancelled this envelope">
          No action is needed. Links for this document no longer work.
        </Alert>
      ) : envelope.status === "DECLINED" ? (
        <Alert tone="danger" title="This envelope was declined">
          {me.status === "DECLINED" ? "You declined it, and the sender has been told." : "Another recipient declined it, so it is closed. No action is needed."}
        </Alert>
      ) : envelope.status === "EXPIRED" ? (
        <Alert tone="warning" title="This envelope has expired">
          It expired at {formatIst(envelope.expiresAt)} before everyone finished. Ask the sender to send a new one if it is still needed.
        </Alert>
      ) : myDone ? (
        <Alert tone="success" title={me.status === "APPROVED" ? "You approved the document" : "You signed the document"}>
          Recorded {formatIst(me.actedAt)}. When everyone has finished, we will email you a link to the final copy with the certificate of
          completion.
        </Alert>
      ) : view.waitingForEarlier ? (
        <Alert tone="info" title="Not your turn yet">
          Earlier steps are still in progress. We will email you a fresh link when it is your turn.
        </Alert>
      ) : me.action === "CC" ? (
        <Alert tone="info" title="You will receive a copy">
          You are copied on this envelope. We will email you the final document when everyone has finished.
        </Alert>
      ) : view.canAct && signerAction ? (
        <SignerFlow token={token} action={signerAction} recipientName={me.name} maskedEmail={me.maskedEmail} verified={view.verified} />
      ) : (
        <Alert tone="info" title="Nothing to do right now">
          There is no open step for you on this envelope.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden /> Document details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            {details ? (
              <div>
                <dt className="text-xs font-medium text-muted">File</dt>
                <dd className="break-words text-ink-2">{details.originalName}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium text-muted">{envelope.status === "COMPLETED" ? "Completed" : "Link valid until"}</dt>
              <dd className="flex items-center gap-1.5 text-ink-2">
                {envelope.status === "COMPLETED" ? (
                  <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                ) : envelope.status === "EXPIRED" ? (
                  <Clock className="size-3.5 text-warning" aria-hidden />
                ) : envelope.status === "VOIDED" ? (
                  <Ban className="size-3.5 text-muted" aria-hidden />
                ) : envelope.status === "DECLINED" ? (
                  <XCircle className="size-3.5 text-danger" aria-hidden />
                ) : (
                  <Hourglass className="size-3.5 text-muted" aria-hidden />
                )}
                {envelope.status === "COMPLETED" ? (details ? formatIst(details.completedAt) : "Yes") : formatIst(envelope.expiresAt)}
              </dd>
            </div>
          </dl>
          {details?.lockedSha256 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted">Document SHA-256 (locked when sent)</p>
              <HashValue value={details.lockedSha256} label="document SHA-256" />
              <p className="text-[13px] text-muted">
                This fingerprint identifies the exact file being signed. If even one character changed, it would be completely different.
              </p>
            </div>
          ) : null}
          <Tier2Notice compact />
        </CardContent>
      </Card>
    </div>
  );
}
