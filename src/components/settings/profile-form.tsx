"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateProfile } from "@/app/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";

export type ProfileDefaults = {
  name: string;
  email: string;
  phone: string;
  locale: string;
  persona: string;
};

export function ProfileForm({ defaults }: { defaults: ProfileDefaults }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await updateProfile({
        name: String(fd.get("name") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        locale: String(fd.get("locale") ?? "en") as "en" | "hi",
        persona: String(fd.get("persona") ?? "advocate") as "advocate",
      });
      if (res.ok) {
        setErrors({});
        toast.success("Profile saved.");
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" error={errors.name} required>
          <Input id="name" name="name" defaultValue={defaults.name} autoComplete="name" required maxLength={80} aria-invalid={Boolean(errors.name)} />
        </Field>
        <Field label="Email" htmlFor="email" hint="Contact support to change your sign-in email.">
          <Input id="email" value={defaults.email} readOnly disabled />
        </Field>
        <Field label="Mobile number" htmlFor="phone" error={errors.phone} hint="Optional. Used for payment receipts and account recovery.">
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 98xxxxxxxx"
            defaultValue={defaults.phone}
            aria-invalid={Boolean(errors.phone)}
          />
        </Field>
        <Field label="Language" htmlFor="locale" hint="Default language for answers and drafts.">
          <Select id="locale" name="locale" defaultValue={defaults.locale === "hi" ? "hi" : "en"}>
            <option value="en">English</option>
            <option value="hi" lang="hi">
              हिन्दी (Hindi)
            </option>
          </Select>
        </Field>
        <Field label="I am" htmlFor="persona" hint="Helps us tune examples and templates.">
          <Select id="persona" name="persona" defaultValue={defaults.persona}>
            <option value="advocate">An advocate</option>
            <option value="student">A law student</option>
            <option value="business">A business / in-house team</option>
            <option value="individual">An individual</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Save profile
        </Button>
      </div>
    </form>
  );
}
