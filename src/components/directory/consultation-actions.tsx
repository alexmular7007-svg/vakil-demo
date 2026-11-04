"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { respondToConsultation, withdrawConsultation } from "@/app/app/advocates/actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";

type Decision = "accepted" | "declined" | "closed";

const copy: Record<Decision, { title: string; button: string; hint: string; toast: string }> = {
  accepted: {
    title: "Accept this request",
    button: "Accept",
    hint: "Optional. For example, when and how you will contact them. They will be emailed this note.",
    toast: "Accepted. The requester has been told and you can now see their email.",
  },
  declined: {
    title: "Decline this request",
    button: "Decline",
    hint: "Optional. A short, courteous reason helps them look elsewhere.",
    toast: "Declined. The requester has been told.",
  },
  closed: {
    title: "Mark as closed",
    button: "Mark closed",
    hint: "Optional note for your records.",
    toast: "Marked as closed.",
  },
};

export function RespondButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!decision) return;
    const note = String(new FormData(e.currentTarget).get("note") ?? "");
    const d = decision;
    start(async () => {
      const res = await respondToConsultation({ id, decision: d, note });
      if (res.ok) {
        toast.success(copy[d].toast);
        setDecision(null);
        setError(null);
        router.refresh();
      } else {
        setError(res.fieldErrors?.note ?? null);
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status === "requested" ? (
          <>
            <Button size="sm" onClick={() => setDecision("accepted")}>
              <Check /> Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDecision("declined")}>
              <X /> Decline
            </Button>
          </>
        ) : status === "accepted" ? (
          <Button size="sm" variant="outline" onClick={() => setDecision("closed")}>
            Mark closed
          </Button>
        ) : null}
      </div>
      <Dialog open={decision !== null} onClose={() => setDecision(null)} title={decision ? copy[decision].title : ""}>
        {decision ? (
          <form onSubmit={submit} className="grid gap-4">
            <Field label="Note" htmlFor={`note-${id}`} hint={copy[decision].hint} error={error}>
              <Textarea id={`note-${id}`} name="note" rows={4} maxLength={2000} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDecision(null)}>
                Cancel
              </Button>
              <Button type="submit" variant={decision === "declined" ? "danger" : "primary"} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {copy[decision].button}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}

export function WithdrawButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await withdrawConsultation(id);
          if (res.ok) {
            toast.success("Request withdrawn.");
            router.refresh();
          } else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      Withdraw
    </Button>
  );
}
