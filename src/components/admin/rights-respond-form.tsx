"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { respondToRightsRequest } from "@/app/admin/rights/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";

export function RightsRespondForm({ id, currentResponse }: { id: string; currentResponse: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await respondToRightsRequest({
            id,
            status: String(fd.get("status")) as "in_progress" | "resolved" | "rejected",
            response: String(fd.get("response") ?? ""),
          });
          if (res.ok) {
            toast.success("Response saved and emailed to the user.");
            setError(null);
            router.refresh();
          } else {
            setError(res.fieldErrors?.response ?? null);
            toast.error(res.error);
          }
        });
      }}
    >
      <Field label="Response to the user" htmlFor={`resp-${id}`} error={error} hint="Emailed to the user and shown in their Privacy settings.">
        <Textarea id={`resp-${id}`} name="response" rows={3} maxLength={4000} defaultValue={currentResponse ?? ""} required />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-end">
        <Field label="Set status" htmlFor={`status-${id}`} className="sm:w-48">
          <Select id={`status-${id}`} name="status" defaultValue="resolved">
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Declined</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Save and notify
        </Button>
      </div>
    </form>
  );
}
