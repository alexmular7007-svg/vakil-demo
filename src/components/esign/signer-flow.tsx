"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, ExternalLink, Loader2, MailCheck, PenLine, ThumbsDown, ThumbsUp, Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/display";
import { Checkbox, Field, Input, Label, Textarea } from "@/components/ui/form";
import { Dialog, Tabs } from "@/components/ui/overlay";
import { CONSENT_TEXT, CONSENT_VERSION, SIGNER_SESSION_MINUTES } from "@/lib/esign/constants";
import { cn } from "@/lib/utils";
import { approveAction, declineAction, signAction } from "@/app/s/[token]/actions";
import { EmailCodeForm } from "./email-code-form";
import { SignaturePad } from "./signature-pad";

type Props = {
  token: string;
  action: "REVIEW" | "SIGN" | "WITNESS";
  recipientName: string;
  maskedEmail: string;
  verified: boolean;
};

function StepHeading({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <CardTitle className="flex items-center gap-2.5">
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          done ? "bg-success text-primary-ink" : "bg-primary-soft text-primary",
        )}
        aria-hidden
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </span>
      <span>{title}</span>
      {done ? <span className="sr-only">(done)</span> : null}
    </CardTitle>
  );
}

export function SignerFlow({ token, action, recipientName, maskedEmail, verified }: Props) {
  const router = useRouter();
  // Completing the envelope issues every party a fresh download link (the old
  // signing link stops working), so the final signer sees a local confirmation.
  const [finished, setFinished] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [typed, setTyped] = useState(recipientName);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [declineError, setDeclineError] = useState<string | null>(null);
  const consentId = useId();

  function afterAct(res: { ok: true; data: { completed: boolean } } | { ok: false; error: string }, doneText: string) {
    if (!res.ok) {
      setError(res.error);
      if (/timed out|code/i.test(res.error)) router.refresh();
      return;
    }
    toast.success(res.data.completed ? `${doneText} Everyone has finished.` : doneText);
    if (res.data.completed) {
      setFinished(true);
      return;
    }
    router.refresh();
  }

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approveAction(token, { consentVersion: CONSENT_VERSION, consentAccepted: consent });
      afterAct(res, "You approved the document.");
    });
  }

  function sign() {
    setError(null);
    if (mode === "typed" && typed.trim().length < 2) {
      setError("Type your full name.");
      return;
    }
    if (mode === "drawn" && !drawn) {
      setError("Draw your signature in the box, or switch to Type.");
      return;
    }
    const signature = mode === "typed" ? { kind: "typed" as const, text: typed.trim() } : { kind: "drawn" as const, image: drawn! };
    startTransition(async () => {
      const res = await signAction(token, { consentVersion: CONSENT_VERSION, consentAccepted: consent, signature });
      afterAct(res, action === "WITNESS" ? "You signed as witness." : "You signed the document.");
    });
  }

  function decline(e: React.FormEvent) {
    e.preventDefault();
    setDeclineError(null);
    if (reason.trim().length < 3) {
      setDeclineError("Tell the sender why (at least 3 characters).");
      return;
    }
    startTransition(async () => {
      const res = await declineAction(token, { reason: reason.trim() });
      if (!res.ok) {
        setDeclineError(res.error);
        return;
      }
      setDeclineOpen(false);
      toast("You declined. The sender has been told.");
      router.refresh();
    });
  }

  const actVerb = action === "REVIEW" ? "approve" : action === "WITNESS" ? "sign as witness" : "sign";

  if (finished) {
    return (
      <div role="status" className="rounded-lg border border-success/30 bg-success-soft p-5 text-sm text-ink-2">
        <p className="font-semibold text-ink">Everyone has finished</p>
        <p className="mt-1">
          The document is complete. We have emailed every party, including you, a new link to download the final PDF with the
          signature page and certificate of completion. Open that link and confirm your email with a one-time code to download it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1: email OTP */}
      <Card>
        <CardHeader>
          <StepHeading n={1} title="Confirm it’s you" done={verified} />
        </CardHeader>
        <CardContent>
          {verified ? (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <MailCheck className="size-4 text-success" aria-hidden /> Your email {maskedEmail} is verified for the next {SIGNER_SESSION_MINUTES} minutes.
            </p>
          ) : (
            <EmailCodeForm token={token} maskedEmail={maskedEmail} />
          )}
        </CardContent>
      </Card>

      {verified ? (
        <>
          {/* Step 2: read the document */}
          <Card>
            <CardHeader>
              <StepHeading n={2} title="Read the document" done={opened} />
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-ink-2">
                The document opens in a new tab. Read all of it before you {actVerb}. Its SHA-256 fingerprint is shown above; your{" "}
                {action === "REVIEW" ? "approval" : "signature"} applies only to that exact file.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={`/s/${token}/document`} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>
                    <ExternalLink aria-hidden /> Open document
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`/s/${token}/document?download=1`} onClick={() => setOpened(true)}>
                    <Download aria-hidden /> Download
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: consent + act */}
          <Card>
            <CardHeader>
              <StepHeading n={3} title={action === "REVIEW" ? "Agree and decide" : "Agree and sign"} />
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={consentId}>Consent to sign electronically</Label>
                  <span className="font-mono text-[11px] text-muted">{CONSENT_VERSION}</span>
                </div>
                <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-surface-2/60 p-3 text-[13px] leading-relaxed whitespace-pre-line text-ink-2 scrollbar-thin" tabIndex={0} aria-label="Consent text">
                  {CONSENT_TEXT}
                </div>
                <label className="mt-3 flex min-h-10 cursor-pointer items-start gap-3 text-sm text-ink">
                  <Checkbox id={consentId} checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5" />
                  <span>I have read the document and agree to the consent text above.</span>
                </label>
                {!opened ? (
                  <p className="mt-1 text-[13px] text-muted">Tip: open the document in step 2 before you continue.</p>
                ) : null}
              </div>

              {action !== "REVIEW" ? (
                <div className="space-y-3">
                  <Tabs
                    value={mode}
                    onChange={(v) => setMode(v as "typed" | "drawn")}
                    tabs={[
                      { value: "typed", label: <span className="inline-flex items-center gap-1.5"><Type className="size-4" aria-hidden /> Type</span> },
                      { value: "drawn", label: <span className="inline-flex items-center gap-1.5"><PenLine className="size-4" aria-hidden /> Draw</span> },
                    ]}
                  />
                  {mode === "typed" ? (
                    <div className="space-y-3">
                      <Field label="Your full name, as your signature" htmlFor="typed-sig" hint="This is recorded exactly as typed.">
                        <Input id="typed-sig" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={120} autoComplete="name" />
                      </Field>
                      {/[^\u0000-ÿ–—‘-”•]/.test(typed) ? (
                        <p className="text-[13px] text-muted">
                          Your typed name is recorded exactly in the audit trail, but the certificate PDF can only print Latin letters. To show
                          your signature in another script on the certificate, choose “Draw”.
                        </p>
                      ) : null}
                      {typed.trim() ? (
                        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-4 py-5" aria-hidden>
                          <p className="truncate font-serif text-3xl text-ink italic">{typed}</p>
                          <div className="mt-1 border-t border-border-strong" />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <SignaturePad onChange={setDrawn} disabled={pending} />
                  )}
                </div>
              ) : null}

              {error ? <Alert tone="danger">{error}</Alert> : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => setDeclineOpen(true)} disabled={pending} className="text-danger hover:text-danger">
                  <ThumbsDown aria-hidden /> Decline
                </Button>
                {action === "REVIEW" ? (
                  <Button type="button" size="lg" onClick={approve} disabled={pending || !consent}>
                    {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ThumbsUp aria-hidden />} Approve document
                  </Button>
                ) : (
                  <Button type="button" size="lg" onClick={sign} disabled={pending || !consent}>
                    {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PenLine aria-hidden />}
                    {action === "WITNESS" ? "Sign as witness" : "Sign document"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Dialog
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Decline this document?"
        description="The envelope closes for everyone and the sender is emailed your reason. This cannot be undone."
      >
        <form onSubmit={decline} className="grid gap-4" noValidate>
          <Field label="Reason" htmlFor="decline-reason" error={declineError} required>
            <Textarea id="decline-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Decline
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
