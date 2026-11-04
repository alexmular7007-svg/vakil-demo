import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/auth-forms";
import { Skeleton } from "@/components/ui/display";
import { GoogleButton } from "@/components/auth/google-button";
import { features } from "@/lib/env";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">Create your account</h1>
      <p className="mt-2 mb-8 text-sm text-muted">Free to start. No card needed.</p>
      {features.googleSignIn ? <GoogleButton label="Sign up with Google" /> : null}
      <Suspense fallback={<Skeleton className="h-[30rem]" />}>
        <SignupForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
