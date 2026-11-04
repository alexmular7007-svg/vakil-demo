import { connection } from "next/server";
import { AlertTriangle, CheckCircle2, CircleDashed, SearchX, ShieldCheck } from "lucide-react";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/display";
import { FileHashCheck } from "@/components/esign/file-hash-check";
import { HashValue } from "@/components/esign/hash-value";
import { Tier2Notice } from "@/components/esign/legal-notice";
import { EnvelopeStatusBadge } from "@/components/esign/status-badge";
import { actionLabels, recipientStatusLabels, roleLabels, type RecipientAction, type RecipientStatus, type RoleLabel } from "@/lib/esign/constants";
import { requestMeta } from "@/lib/esign/context";
import { formatIst } from "@/lib/esign/format";
import { getPublicIntegrity, getPublicVerification, type PublicIntegrity } from "@/lib/esign/queries";
import { envelopeIdSchema } from "@/lib/esign/schemas";

const STORED_COPY_TEXT: Record<NonNullable<PublicIntegrity["storedFinal"]>, string> = {
  ok: "Vaakil AI's stored copy of the signed PDF still has this fingerprint.",
  mismatch: "Vaakil AI's stored copy of the signed PDF no longer has this fingerprint. Rely on a copy that matches the fingerprint above, and contact the sender.",
  missing: "Vaakil AI's stored copy of the signed PDF could not be found. Copies held by the parties can still be checked against the fingerprint above.",
  unavailable: "The stored copy could not be checked just now. Try again later.",
};

function IntegrityRow({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-ink-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      ) : warn ? (
        <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      )}
      <span>{children}</span>
    </li>
  );
}

function NotFound() {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <CardContent className="space-y-3 p-8">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
          <SearchX className="size-5" aria-hidden />
        </span>
        <h1 className="font-serif text-xl font-semibold text-ink">No envelope found</h1>
        <p className="text-sm text-muted">Check that the link or QR code is complete. Unsent drafts are never public.</p>
      </CardContent>
    </Card>
  );
}

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const parsed = envelopeIdSchema.safeParse(id);
  if (!parsed.success) return <NotFound />;
  // Applies expiry first, so an overdue envelope is never shown as in progress.
  const data = await getPublicVerification(parsed.data);
  if (!data) return <NotFound />;
  const integrity = await getPublicIntegrity(parsed.data, { ip: (await requestMeta()).ip }).catch((err: unknown) => {
    console.error("[esign] public integrity check failed", err);
    return null;
  });
  const { envelope, recipients } = data;
  const completed = envelope.status === "COMPLETED" && envelope.finalSha256;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <ShieldCheck className="size-4 text-primary" aria-hidden /> Envelope verification
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance text-ink sm:text-[28px]">{envelope.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <EnvelopeStatusBadge status={envelope.status} />
          {envelope.completedAt ? <span>Completed {formatIst(envelope.completedAt)}</span> : envelope.lockedAt ? <span>Sent {formatIst(envelope.lockedAt)}</span> : null}
        </div>
        <p className="font-mono text-xs break-all text-muted">Envelope {envelope.id}</p>
      </div>

      {completed ? (
        <Card>
          <CardHeader>
            <CardTitle>Final document fingerprint</CardTitle>
            <CardDescription>SHA-256 of the completed PDF, including its signature page and certificate of completion.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <HashValue value={envelope.finalSha256!} label="final document SHA-256" />
            <FileHashCheck expected={envelope.finalSha256!} />
          </CardContent>
        </Card>
      ) : (
        <Alert tone={envelope.status === "DECLINED" || envelope.status === "VOIDED" ? "warning" : "info"} title="No final document">
          {envelope.status === "DECLINED"
            ? "This envelope was declined, so it was never completed."
            : envelope.status === "VOIDED"
              ? "The sender voided this envelope, so it was never completed."
              : envelope.status === "EXPIRED"
                ? "This envelope expired before everyone finished."
                : "Signing is still in progress. The final fingerprint appears here when everyone has finished."}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Integrity checks</CardTitle>
          <CardDescription>Run on the server each time this page opens.</CardDescription>
        </CardHeader>
        <CardContent>
          {integrity ? (
            <ul className="space-y-2">
              <IntegrityRow ok={integrity.chain.ok}>
                {integrity.chain.ok
                  ? `Audit trail intact: ${integrity.chain.checked} hash-chained events re-verified.`
                  : "The audit trail does not verify. Treat this envelope's record with caution and contact the sender."}
              </IntegrityRow>
              {integrity.storedFinal ? (
                <IntegrityRow ok={integrity.storedFinal === "ok"} warn={integrity.storedFinal === "unavailable"}>
                  {STORED_COPY_TEXT[integrity.storedFinal]}
                </IntegrityRow>
              ) : null}
            </ul>
          ) : (
            <p className="text-sm text-muted">The integrity checks could not run just now. Try again later.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parties</CardTitle>
          <CardDescription>Roles and times only. Names and contact details are not shown publicly.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border border-t border-border">
            {recipients.map((r, i) => {
              const done = r.status === "APPROVED" || r.status === "SIGNED";
              return (
                <li key={i} className="flex items-start gap-3 px-5 py-3 text-sm">
                  {done ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">
                      {roleLabels[r.roleLabel as RoleLabel] ?? r.roleLabel} · {actionLabels[r.action as RecipientAction] ?? r.action}
                      {r.action !== "CC" ? <span className="text-muted"> · step {r.routingOrder}</span> : null}
                    </p>
                    <p className="text-[13px] text-muted">
                      {r.action === "CC"
                        ? "Receives a copy"
                        : r.actedAt
                          ? `${recipientStatusLabels[r.status as RecipientStatus] ?? r.status} ${formatIst(r.actedAt)}`
                          : "Not yet"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {envelope.signatureType === "electronic" ? <Tier2Notice compact /> : null}
    </div>
  );
}
