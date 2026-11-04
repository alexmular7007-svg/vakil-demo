"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { saveBillingProfile } from "@/app/app/fees/actions";

export type ProfileValues = {
  displayName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  upiId: string | null;
  invoicePrefix: string;
};

export function BillingProfileForm({ profile, fyLabel }: { profile: ProfileValues; fyLabel: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>();
  const [prefix, setPrefix] = useState(profile.invoicePrefix);
  const [pending, start] = useTransition();
  const uid = useId();
  const f = (n: string) => `${uid}-${n}`;
  const cleanPrefix = prefix.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || "INV";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveBillingProfile(fd);
          if (!r.ok) {
            setErrors(r.fieldErrors);
            toast.error(r.error);
            return;
          }
          setErrors(undefined);
          toast.success("Billing profile saved");
          router.refresh();
        });
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <Field label="Name on the letterhead" htmlFor={f("name")} error={errors?.displayName} className="sm:col-span-2" hint="Your name as an advocate, or your firm's name.">
        <Input id={f("name")} name="displayName" defaultValue={profile.displayName} maxLength={200} placeholder="e.g. Adv. Ritika Sharma" />
      </Field>
      <Field label="Chamber address" htmlFor={f("address")} error={errors?.address} className="sm:col-span-2">
        <Textarea id={f("address")} name="address" defaultValue={profile.address ?? ""} maxLength={1000} rows={3} />
      </Field>
      <Field label="Phone" htmlFor={f("phone")} error={errors?.phone}>
        <Input id={f("phone")} name="phone" type="tel" inputMode="tel" defaultValue={profile.phone ?? ""} maxLength={30} className="tabular" />
      </Field>
      <Field label="Email" htmlFor={f("email")} error={errors?.email}>
        <Input id={f("email")} name="email" type="email" defaultValue={profile.email ?? ""} maxLength={200} />
      </Field>
      <Field
        label="UPI ID"
        htmlFor={f("upi")}
        error={errors?.upiId}
        hint="Shown as a Pay by UPI QR code on every memo with a balance due."
      >
        <Input id={f("upi")} name="upiId" defaultValue={profile.upiId ?? ""} maxLength={120} autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="name@okhdfcbank" />
      </Field>
      <Field label="Your GSTIN (if registered)" htmlFor={f("gstin")} error={errors?.gstin} hint="Needed only if you charge GST on your fees.">
        <Input
          id={f("gstin")}
          name="gstin"
          defaultValue={profile.gstin ?? ""}
          maxLength={20}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase tabular"
        />
      </Field>
      <Field label="Invoice prefix" htmlFor={f("prefix")} error={errors?.invoicePrefix} hint={<span className="tabular">Next memo: {cleanPrefix}/{fyLabel}/…</span>}>
        <Input
          id={f("prefix")}
          name="invoicePrefix"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono tabular"
        />
      </Field>
      <div className="flex items-end sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save profile
        </Button>
      </div>
    </form>
  );
}
