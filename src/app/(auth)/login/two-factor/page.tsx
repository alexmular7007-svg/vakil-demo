import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoFactorForm } from "@/components/auth/auth-forms";
import { Skeleton } from "@/components/ui/display";

export const metadata: Metadata = { title: "Two-factor verification" };

export default function TwoFactorPage() {
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">Two-step verification</h1>
      <p className="mt-2 mb-8 text-sm text-muted">Enter the code from your authenticator app to finish signing in.</p>
      <Suspense fallback={<Skeleton className="h-56" />}>
        <TwoFactorForm />
      </Suspense>
    </>
  );
}
