"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { recordSignupConsent } from "@/app/(auth)/actions";

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
function safeNext(next: string | null, fallback = "/app") {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

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

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(
    params.get("error") ? "Google sign-in did not complete. Try again, or sign in with your email and password." : null,
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const { data, error } = await authClient.signIn.email({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      rememberMe: fd.get("remember") === "on",
    });
    setPending(false);
    if (error) {
      setError(error.status === 429 ? "Too many attempts. Wait a minute and try again." : error.message ?? "Sign-in failed.");
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      router.push(`/login/two-factor?next=${encodeURIComponent(next)}`);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-ink-2">
          <Checkbox name="remember" defaultChecked /> Keep me signed in
        </label>
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 className="animate-spin" /> : null} Sign in
      </Button>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [verifySent, setVerifySent] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password"));
    if (password.length < 10) {
      setError("Use at least 10 characters for your password.");
      return;
    }
    if (fd.get("consent") !== "on") {
      setError("Please accept the Terms and Privacy notice to continue.");
      return;
    }
    setPending(true);
    const email = String(fd.get("email"));
    const { data, error } = await authClient.signUp.email({
      name: String(fd.get("name")).trim(),
      email,
      password,
      persona: String(fd.get("persona")),
      callbackURL: "/app",
    } as Parameters<typeof authClient.signUp.email>[0]);
    if (error) {
      setPending(false);
      setError(error.status === 429 ? "Too many sign-ups from this network. Try again later." : error.message ?? "Sign-up failed.");
      return;
    }
    if (data?.token) {
      await recordSignupConsent(fd.get("marketing") === "on");
      toast.success("Welcome to Vaakil AI");
      const plan = params.get("plan");
      router.push(plan ? `/app/settings/billing?plan=${encodeURIComponent(plan)}` : "/app");
      router.refresh();
    } else {
      setPending(false);
      setVerifySent(email);
    }
  }

  if (verifySent) {
    return (
      <Alert tone="success" title="Check your email">
        We sent a verification link to <strong>{verifySent}</strong>. Open it to activate your account.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Full name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="I am" htmlFor="persona">
        <Select id="persona" name="persona" defaultValue="advocate">
          <option value="advocate">An advocate</option>
          <option value="student">A law student</option>
          <option value="business">A business / in-house team</option>
          <option value="individual">An individual</option>
        </Select>
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-ink-2">
        <Checkbox name="consent" required className="mt-0.5" />
        <span>
          I agree to the <Link href="/legal/terms" className="text-primary underline">Terms</Link> and consent to processing
          of my data as described in the <Link href="/legal/privacy" className="text-primary underline">Privacy notice</Link>.
        </span>
      </label>
      <label className="flex items-start gap-2.5 text-sm text-ink-2">
        <Checkbox name="marketing" className="mt-0.5" />
        <span>Send me product updates (optional).</span>
      </label>
      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 className="animate-spin" /> : null} Create account
      </Button>
    </form>
  );
}

export function TwoFactorForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code")).replace(/\s/g, "");
    const trustDevice = fd.get("trust") === "on";
    const res =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    setPending(false);
    if (res.error) {
      setError(res.error.status === 429 ? "Too many attempts. Wait a minute." : "That code is not valid. Try again.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field
        label={mode === "totp" ? "6-digit code from your authenticator app" : "Backup code"}
        htmlFor="code"
      >
        <Input
          id="code"
          name="code"
          inputMode={mode === "totp" ? "numeric" : "text"}
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={mode === "totp" ? 6 : 32}
          className="text-center text-lg tracking-[0.3em]"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <Checkbox name="trust" /> Trust this device for 30 days
      </label>
      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 className="animate-spin" /> : null} Verify
      </Button>
      <button type="button" onClick={() => setMode(mode === "totp" ? "backup" : "totp")} className="text-sm text-primary hover:underline">
        {mode === "totp" ? "Use a backup code instead" : "Use authenticator code"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    await authClient.requestPasswordReset({ email: String(fd.get("email")), redirectTo: "/reset-password" });
    setPending(false);
    // Same message whether or not the account exists (no account enumeration).
    setSent(true);
  }
  if (sent) {
    return <Alert tone="success" title="Check your email">If an account exists for that address, a reset link is on its way.</Alert>;
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 className="animate-spin" /> : null} Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(params.get("error") ? "This link is invalid or has expired." : null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const fd = new FormData(e.currentTarget);
    const pw = String(fd.get("password"));
    if (pw.length < 10) return setError("Use at least 10 characters.");
    if (pw !== String(fd.get("confirm"))) return setError("Passwords do not match.");
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: pw, token });
    setPending(false);
    if (error) return setError(error.message ?? "Could not reset password.");
    toast.success("Password updated. Please sign in.");
    router.push("/login");
  }
  if (!token) return <Alert tone="danger">{error ?? "Missing reset token. Request a new link."}</Alert>;
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="New password" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </Field>
      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 className="animate-spin" /> : null} Update password
      </Button>
    </form>
  );
}
