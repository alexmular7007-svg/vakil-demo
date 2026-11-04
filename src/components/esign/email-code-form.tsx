"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { OTP_RESEND_SECONDS, OTP_TTL_MINUTES } from "@/lib/esign/constants";
import { requestOtpAction, verifyOtpAction } from "@/app/s/[token]/actions";

/** Email one-time code step of the signer portal: request a code, then enter it. Refreshes the page when verified. */
export function EmailCodeForm({ token, maskedEmail }: { token: string; maskedEmail: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function sendCode() {
    setError(null);
    startTransition(async () => {
      const res = await requestOtpAction(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCodeSent(true);
      setCooldown(OTP_RESEND_SECONDS);
      toast.success(`Code sent to ${res.data.maskedEmail}`);
      setTimeout(() => codeRef.current?.focus(), 50);
    });
  }

  function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await verifyOtpAction(token, code);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Email verified");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        We will email a 6-digit one-time code to <span className="font-medium text-ink">{maskedEmail}</span>. It expires in {OTP_TTL_MINUTES} minutes.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {codeSent ? (
        <form onSubmit={verify} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" noValidate>
          <Field label="One-time code" htmlFor={inputId}>
            <Input
              ref={codeRef}
              id={inputId}
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="font-mono text-lg tracking-[0.4em]"
              required
            />
          </Field>
          <Button type="submit" size="lg" disabled={pending || code.length !== 6} className="h-10 sm:h-10">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Verify
          </Button>
          <div className="sm:col-span-2">
            <Button type="button" variant="link" onClick={sendCode} disabled={pending || cooldown > 0} className="h-10">
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Send a new code"}
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" onClick={sendCode} disabled={pending} size="lg">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <MailCheck aria-hidden />} Email me a code
        </Button>
      )}
    </div>
  );
}
