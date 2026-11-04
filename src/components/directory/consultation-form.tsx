"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { requestConsultation } from "@/app/app/advocates/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";

export function ConsultationForm({
  advocateId,
  advocateName,
  chatId,
  defaultSubject,
}: {
  advocateId: string;
  advocateName: string;
  chatId: string | null;
  defaultSubject: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await requestConsultation({
        advocateId,
        subject: String(fd.get("subject") ?? ""),
        summary: String(fd.get("summary") ?? ""),
        chatId,
      });
      if (res.ok) {
        toast.success(`Request sent to ${advocateName}.`);
        router.push("/app/advocates/inbox");
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field label="Subject" htmlFor="subject" error={errors.subject} required>
        <Input id="subject" name="subject" defaultValue={defaultSubject} maxLength={140} required placeholder="e.g. Cheque bounce notice received" />
      </Field>
      <Field
        label="Summary of the matter"
        htmlFor="summary"
        error={errors.summary}
        required
        hint="The advocate sees this summary and your name. Do not include passwords, Aadhaar or bank numbers."
      >
        <Textarea id="summary" name="summary" rows={6} maxLength={4000} required />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          Send request
        </Button>
      </div>
    </form>
  );
}
