"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createRightsRequest, setMarketingConsent } from "@/app/app/settings/privacy/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/overlay";
import { formatDate } from "@/lib/utils";

export function MarketingConsentSwitch({ granted }: { granted: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(granted);
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={value}
      disabled={pending}
      label="Product update emails"
      onChange={(next) => {
        setValue(next);
        start(async () => {
          const res = await setMarketingConsent(next);
          if (res.ok) {
            toast.success(next ? "You will get product updates." : "Consent withdrawn. No more product emails.");
            router.refresh();
          } else {
            setValue(!next);
            toast.error(res.error);
          }
        });
      }}
    />
  );
}

const types = [
  { value: "access", label: "Access: a summary of the data you hold about me" },
  { value: "correction", label: "Correction: fix or complete my data" },
  { value: "erasure", label: "Erasure: delete my data and close my account" },
  { value: "grievance", label: "Grievance: a complaint about how my data is handled" },
] as const;

type RequestType = (typeof types)[number]["value"];

export function RightsRequestForm({ initialType }: { initialType: RequestType }) {
  const router = useRouter();
  const [type, setType] = useState<RequestType>(initialType);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const details = String(new FormData(form).get("details") ?? "");
    start(async () => {
      const res = await createRightsRequest({ type, details });
      if (res.ok) {
        setError(null);
        form.reset();
        toast.success(`Request recorded. We will respond by ${formatDate(res.data.dueAt)}.`);
        router.refresh();
      } else {
        setError(res.fieldErrors?.details ?? null);
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field label="Type of request" htmlFor="rr-type">
        <Select id="rr-type" value={type} onChange={(e) => setType(e.target.value as RequestType)}>
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Details"
        htmlFor="rr-details"
        error={error}
        hint={
          type === "erasure"
            ? "Erasure closes your account. Records we must keep by law (payment records, signed e-sign audit trails) are retained only as long as required."
            : type === "correction"
              ? "Say what is wrong and what it should be."
              : "Anything that helps us act on it quickly."
        }
      >
        <Textarea id="rr-details" name="details" rows={4} maxLength={4000} required />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant={type === "erasure" ? "danger" : "primary"} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Submit request
        </Button>
      </div>
    </form>
  );
}
