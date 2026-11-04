"use client";

import { useState, useTransition } from "react";
import { Link2, Loader2 } from "lucide-react";
import { verifyChain } from "@/app/admin/audit/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";

type Report = { ok: boolean; checked: number; brokenAtSeq?: number; reason?: string };

export function VerifyChainButton() {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await verifyChain();
            if (res.ok) {
              setReport(res.data);
              setError(null);
            } else {
              setError(res.error);
              setReport(null);
            }
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Link2 />}
        Verify chain
      </Button>
      <div aria-live="polite">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {report ? (
          report.ok ? (
            <Alert tone="success" title="Chain intact">
              All {report.checked.toLocaleString("en-IN")} events were re-hashed and every link matches.
            </Alert>
          ) : (
            <Alert tone="danger" title={`Chain broken at event #${report.brokenAtSeq}`}>
              {report.reason}. {report.checked.toLocaleString("en-IN")} earlier events verified. Treat the log after this
              point as untrustworthy and investigate.
            </Alert>
          )
        ) : null}
      </div>
    </div>
  );
}
