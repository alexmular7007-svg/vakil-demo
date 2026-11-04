import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-forms";
import { Skeleton } from "@/components/ui/display";
import { GoogleButton } from "@/components/auth/google-button";
import { features } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-2 mb-8 text-sm text-muted">Sign in to your Vaakil AI workspace.</p>
      {features.googleSignIn ? <GoogleButton label="Continue with Google" /> : null}
      <Suspense fallback={<Skeleton className="h-72" />}>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
