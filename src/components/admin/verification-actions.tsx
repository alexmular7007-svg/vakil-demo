"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { approveAdvocate, rejectAdvocate } from "@/app/admin/verifications/actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { useConfirm } from "@/components/ui/confirm";

export function VerificationActions({ userId, name, mode }: { userId: string; name: string; mode: "pending" | "verified" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  return (
    <div className="flex flex-wrap gap-2">
      {mode === "pending" ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={async () => {
            if (
              !(await confirm({
                title: `Verify ${name}?`,
                description: "Confirm you checked the enrolment number against the State Bar Council roll. The approval is recorded in the audit log.",
                confirmLabel: "Approve",
              }))
            )
              return;
            start(async () => {
              const res = await approveAdvocate(userId);
              if (res.ok) {
                toast.success(`${name} is now verified.`);
                router.refresh();
              } else toast.error(res.error);
            });
          }}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve
        </Button>
      ) : null}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
        <X /> {mode === "pending" ? "Reject" : "Revoke verification"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={mode === "pending" ? `Reject ${name}` : `Revoke ${name}'s verification`}
        description="The advocate is emailed this reason and can correct their details and resubmit."
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
            start(async () => {
              const res = await rejectAdvocate({ userId, reason });
              if (res.ok) {
                toast.success(mode === "pending" ? "Application rejected." : "Verification revoked.");
                setOpen(false);
                setError(null);
                router.refresh();
              } else {
                setError(res.fieldErrors?.reason ?? null);
                toast.error(res.error);
              }
            });
          }}
        >
          <Field label="Reason" htmlFor={`reject-${userId}`} error={error}>
            <Textarea
              id={`reject-${userId}`}
              name="reason"
              rows={4}
              maxLength={1000}
              required
              placeholder="e.g. The enrolment number does not match the name on the Bar Council of Delhi roll."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {mode === "pending" ? "Reject" : "Revoke"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
