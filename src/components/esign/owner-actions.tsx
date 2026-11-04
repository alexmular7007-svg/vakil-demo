"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, BellRing, Loader2, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { isInFlight } from "@/lib/esign/workflow";
import { deleteDraftAction, remindAction, retryCompletionAction, sendEnvelopeAction, voidEnvelopeAction } from "@/app/app/sign/actions";

type Props = {
  envelopeId: string;
  status: string;
  firstStepNames: string[];
  canRemind: boolean;
  needsCompletion: boolean;
};

export function OwnerActions({ envelopeId, status, firstStepNames, canRemind, needsCompletion }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"send" | "delete" | "void" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setDialog(null);
    setError(null);
  };

  function run<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, onOk: (data: T) => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        if (!dialog) toast.error(res.error);
        return;
      }
      onOk(res.data);
    });
  }

  const inFlight = isInFlight(status);

  return (
    <>
      {status === "DRAFT" ? (
        <>
          <Button variant="outline" onClick={() => setDialog("delete")} disabled={pending}>
            <Trash2 aria-hidden /> Delete draft
          </Button>
          <Button onClick={() => setDialog("send")} disabled={pending}>
            <Send aria-hidden /> Send for signature
          </Button>
        </>
      ) : null}
      {inFlight && needsCompletion ? (
        <Button
          onClick={() =>
            run(
              () => retryCompletionAction(envelopeId),
              () => {
                toast.success("Completed. Everyone has been emailed the final copy.");
                router.refresh();
              },
            )
          }
          disabled={pending}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Finish completion
        </Button>
      ) : null}
      {inFlight && canRemind ? (
        <Button
          variant="outline"
          onClick={() =>
            run(
              () => remindAction(envelopeId),
              (d) => {
                toast.success(d.reminded ? `Reminder sent to ${d.reminded} ${d.reminded === 1 ? "person" : "people"} with a fresh link.` : "No one is waiting right now.");
                if (d.emailFailures) toast.error(`${d.emailFailures} email(s) could not be sent. The audit trail shows which; try the reminder again later.`);
                router.refresh();
              },
            )
          }
          disabled={pending}
        >
          <BellRing aria-hidden /> Send reminder
        </Button>
      ) : null}
      {inFlight ? (
        <Button variant="outline" className="text-danger hover:text-danger" onClick={() => setDialog("void")} disabled={pending}>
          <Ban aria-hidden /> Void
        </Button>
      ) : null}

      <Dialog
        open={dialog === "send"}
        onClose={close}
        title="Send for signature?"
        description="The PDF’s SHA-256 is locked now and cannot change afterwards."
        footer={
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                run(
                  () => sendEnvelopeAction(envelopeId),
                  (d) => {
                    close();
                    toast.success(`Sent. ${d.notified} ${d.notified === 1 ? "person has" : "people have"} been emailed a personal link.`);
                    if (d.emailFailures) toast.error(`${d.emailFailures} email(s) could not be sent. Use “Send reminder” to retry.`);
                    router.refresh();
                  },
                )
              }
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send now
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          <p>
            First step: {firstStepNames.length ? <span className="font-medium text-ink">{firstStepNames.join(", ")}</span> : "—"}. Later steps are
            emailed automatically when the earlier ones finish.
          </p>
          <p>Each person confirms their email with a one-time code before they can open the document.</p>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </div>
      </Dialog>

      <Dialog
        open={dialog === "delete"}
        onClose={close}
        title="Delete this draft?"
        description="The draft and its uploaded PDF are removed. This cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                run(
                  () => deleteDraftAction(envelopeId),
                  () => {
                    close();
                    toast.success("Draft deleted.");
                    router.push("/app/sign");
                  },
                )
              }
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />} Delete
            </Button>
          </>
        }
      >
        {error ? <Alert tone="danger">{error}</Alert> : <p className="text-sm text-ink-2">Sent envelopes cannot be deleted; they can only be voided.</p>}
      </Dialog>

      <Dialog
        open={dialog === "void"}
        onClose={close}
        title="Void this envelope?"
        description="Signing links stop working and everyone who received one is told. The audit trail is kept."
      >
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 3) {
              setError("Give a short reason (at least 3 characters).");
              return;
            }
            run(
              () => voidEnvelopeAction({ envelopeId, reason: reason.trim() }),
              () => {
                close();
                setReason("");
                toast.success("Envelope voided.");
                router.refresh();
              },
            );
          }}
        >
          <Field label="Reason (sent to recipients)" htmlFor="void-reason" error={error} required>
            <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Ban aria-hidden />} Void envelope
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
