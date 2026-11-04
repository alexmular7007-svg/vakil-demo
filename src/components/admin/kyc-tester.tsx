"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { kycAadhaarGenerateOtp, kycAadhaarVerifyOtp, kycVerifyBank, kycVerifyPan } from "@/app/admin/kyc/actions";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Tabs } from "@/components/ui/overlay";

type Result = { ok: boolean; httpStatus: number | null; message: string; data: unknown };
type Tab = "pan" | "bank" | "aadhaar";

function ResultPanel({ title, result }: { title: string; result: Result }) {
  return (
    <div className="space-y-2" aria-live="polite">
      <div className={result.ok ? "flex items-center gap-2 text-success" : "flex items-center gap-2 text-danger"}>
        {result.ok ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
        <p className="text-sm font-medium">
          {title}: {result.ok ? "success" : "failed"}
          {result.httpStatus ? <span className="text-muted"> (HTTP {result.httpStatus})</span> : null}
        </p>
      </div>
      <p className="text-sm text-ink-2">{result.message}</p>
      {result.data ? (
        <pre className="scrollbar-thin max-h-72 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs text-ink-2">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      ) : null}
      <p className="text-xs text-muted">Identity numbers in the response are masked. Nothing here is stored except a masked audit entry.</p>
    </div>
  );
}

function ConsentBox({ id }: { id: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 text-sm text-ink-2">
      <Checkbox id={id} name="consent" required className="mt-0.5" />
      <span>I have the informed consent of the person whose details I am checking, and I accept that this call is billed to the CGPEY wallet.</span>
    </label>
  );
}

export function KycTester() {
  const [tab, setTab] = useState<Tab>("pan");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ title: string; result: Result } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  function run(title: string, fn: () => Promise<{ ok: true; data: Result } | { ok: false; error: string; fieldErrors?: Record<string, string> }>) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setErrors({});
        setResult({ title, result: res.data });
        if (title === "Aadhaar OTP" && res.data.ok) setOtpSent(true);
        if (title === "Aadhaar verification") {
          setOtpSent(false);
          setAadhaarNumber("");
        }
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="p-5">
      <Tabs
        tabs={[
          { value: "pan", label: "PAN" },
          { value: "bank", label: "Bank account" },
          { value: "aadhaar", label: "Aadhaar OTP" },
        ]}
        value={tab}
        onChange={(v) => {
          setTab(v as Tab);
          setResult(null);
          setErrors({});
        }}
        className="max-w-full overflow-x-auto"
      />

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          {tab === "pan" ? (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run("PAN verification", () => kycVerifyPan({ pan: String(fd.get("pan") ?? "") }));
              }}
            >
              <Field label="PAN" htmlFor="kyc-pan" error={errors.pan}>
                <Input id="kyc-pan" name="pan" maxLength={10} autoComplete="off" placeholder="ABCDE1234F" className="font-mono uppercase" required />
              </Field>
              <ConsentBox id="kyc-pan-consent" />
              <Button type="submit" disabled={pending} className="sm:justify-self-start">
                {pending ? <Loader2 className="animate-spin" /> : null}
                Verify PAN
              </Button>
            </form>
          ) : null}

          {tab === "bank" ? (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run("Bank verification", () =>
                  kycVerifyBank({
                    accountNo: String(fd.get("accountNo") ?? ""),
                    ifscCode: String(fd.get("ifscCode") ?? ""),
                    name: String(fd.get("name") ?? ""),
                  }),
                );
              }}
            >
              <Field label="Account number" htmlFor="kyc-acc" error={errors.accountNo}>
                <Input id="kyc-acc" name="accountNo" inputMode="numeric" autoComplete="off" maxLength={20} className="font-mono" required />
              </Field>
              <Field label="IFSC" htmlFor="kyc-ifsc" error={errors.ifscCode}>
                <Input id="kyc-ifsc" name="ifscCode" maxLength={11} autoComplete="off" placeholder="HDFC0001234" className="font-mono uppercase" required />
              </Field>
              <Field label="Account holder name" htmlFor="kyc-name" error={errors.name}>
                <Input id="kyc-name" name="name" maxLength={100} autoComplete="off" required />
              </Field>
              <ConsentBox id="kyc-bank-consent" />
              <Button type="submit" disabled={pending} className="sm:justify-self-start">
                {pending ? <Loader2 className="animate-spin" /> : null}
                Verify account
              </Button>
            </form>
          ) : null}

          {tab === "aadhaar" ? (
            <div className="grid gap-4">
              <Alert tone="warning">
                Aadhaar OTP confirms only that someone controls the Aadhaar-linked mobile right now. It is identity
                verification, not an Aadhaar eSign, and produces no signature or certificate.
              </Alert>
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  run("Aadhaar OTP", () => kycAadhaarGenerateOtp({ aadhaarNumber }));
                }}
              >
                <Field label="Aadhaar number" htmlFor="kyc-aadhaar" error={errors.aadhaarNumber}>
                  <Input
                    id="kyc-aadhaar"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={14}
                    value={aadhaarNumber}
                    onChange={(e) => {
                      setAadhaarNumber(e.target.value);
                      setOtpSent(false);
                    }}
                    className="font-mono"
                    required
                  />
                </Field>
                <ConsentBox id="kyc-aadhaar-consent" />
                <Button type="submit" variant={otpSent ? "outline" : "primary"} disabled={pending} className="sm:justify-self-start">
                  {pending && !otpSent ? <Loader2 className="animate-spin" /> : null}
                  {otpSent ? "Send OTP again" : "Send OTP"}
                </Button>
              </form>
              {otpSent ? (
                <form
                  className="grid gap-4 border-t border-border pt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const otp = String(new FormData(e.currentTarget).get("otp") ?? "");
                    run("Aadhaar verification", () => kycAadhaarVerifyOtp({ aadhaarNumber, otp }));
                  }}
                >
                  <Field label="OTP sent to the Aadhaar-linked mobile" htmlFor="kyc-otp" error={errors.otp}>
                    <Input
                      id="kyc-otp"
                      name="otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="font-mono tracking-[0.3em]"
                      required
                    />
                  </Field>
                  <Button type="submit" disabled={pending} className="sm:justify-self-start">
                    {pending ? <Loader2 className="animate-spin" /> : null}
                    Verify OTP (billed)
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 rounded-lg border border-dashed border-border-strong p-4">
          {result ? <ResultPanel title={result.title} result={result.result} /> : <p className="text-sm text-muted">Results appear here.</p>}
        </div>
      </div>
    </Card>
  );
}
