"use client";

import { useRef, useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { changePassword } from "@/app/app/settings/security/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function PasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await changePassword({
        currentPassword: String(fd.get("currentPassword") ?? ""),
        newPassword: String(fd.get("newPassword") ?? ""),
        confirmPassword: String(fd.get("confirmPassword") ?? ""),
        revokeOtherSessions: fd.get("revokeOtherSessions") === "on",
      });
      if (res.ok) {
        setErrors({});
        formRef.current?.reset();
        toast.success("Password changed.");
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword}>
        <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" required aria-invalid={Boolean(errors.currentPassword)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" htmlFor="newPassword" error={errors.newPassword} hint="At least 10 characters.">
          <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" minLength={10} maxLength={128} required aria-invalid={Boolean(errors.newPassword)} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword}>
          <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required aria-invalid={Boolean(errors.confirmPassword)} />
        </Field>
      </div>
      <label className="flex items-start gap-2.5 text-sm text-ink-2">
        <Checkbox name="revokeOtherSessions" defaultChecked className="mt-0.5" />
        <span>Sign out of all other devices</span>
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Change password
        </Button>
      </div>
    </form>
  );
}
