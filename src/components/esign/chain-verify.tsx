"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Link2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { verifyChainAction } from "@/app/app/sign/actions";
import type { EnvelopeChainReport } from "@/lib/esign/events";

/** Re-hash every event on the server and show whether the chain is intact. */
export function ChainVerify({ envelopeId, disabled }: { envelopeId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<EnvelopeChainReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        className="h-10"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await verifyChainAction(envelopeId);
            if (!res.ok) {
              setReport(null);
              setError(res.error);
            } else {
              setReport(res.data);
            }
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />} Verify chain
      </Button>
      <div aria-live="polite">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {report ? (
          report.ok ? (
            <Alert tone="success" title={`Chain intact: ${report.checked} events re-hashed`}>
              <p className="break-all">
                Head hash <code className="font-mono text-[12px]">{report.headHash}</code>
              </p>
              {report.documentChecks.length ? (
                <ul className="mt-2 space-y-1">
                  {report.documentChecks.map((c) => (
                    <li key={c.label} className="flex items-start gap-1.5">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> {c.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : (
            <Alert tone="danger" title="The audit chain does not verify">
              {report.reason ? (
                <p>
                  Event #{report.brokenAtSeq}: {report.reason}. {report.checked} events before it verified.
                </p>
              ) : null}
              <ul className="mt-2 space-y-1">
                {report.documentChecks.map((c) => (
                  <li key={c.label} className="flex items-start gap-1.5">
                    {c.ok ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                    ) : (
                      <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                    )}
                    {c.label}
                  </li>
                ))}
              </ul>
            </Alert>
          )
        ) : null}
      </div>
    </div>
  );
}
