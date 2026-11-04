import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { Skeleton } from "@/components/ui/display";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">Set a new password</h1>
      <p className="mt-2 mb-8 text-sm text-muted">Choose a password you have not used elsewhere.</p>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
