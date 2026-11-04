"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { recordTwoFactorChange } from "@/app/app/settings/security/actions";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";

type Step =
  | { kind: "idle" }
  | { kind: "password"; purpose: "enable" | "disable" | "codes" }
  | { kind: "scan"; totpURI: string; backupCodes: string[] }
  | { kind: "codes"; backupCodes: string[]; justEnabled: boolean };

function secretFromUri(uri: string) {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

function errorMessage(error: { status?: number; message?: string } | null | undefined, fallback: string) {
  if (!error) return fallback;
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (error.message && /invalid password/i.test(error.message)) return "That password is incorrect.";
  if (error.message && /invalid code|invalid two factor/i.test(error.message)) return "That code did not match. Check your authenticator app and try again.";
  return error.message || fallback;
}

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const scanUri = step.kind === "scan" ? step.totpURI : null;
  useEffect(() => {
    if (!scanUri) return;
    let cancelled = false;
    QRCode.toDataURL(scanUri, { margin: 1, width: 224, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [scanUri]);

  function close() {
    setStep({ kind: "idle" });
    setError(null);
    setQr(null);
  }

  async function submitPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== "password") return;
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!password) return setError("Enter your password.");
    setBusy(true);
    setError(null);
    try {
      if (step.purpose === "enable") {
        const { data, error } = await authClient.twoFactor.enable({ password, method: "totp" });
        if (error || !data || !("totpURI" in data)) return setError(errorMessage(error, "Could not start two-factor setup."));
        setStep({ kind: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes });
      } else if (step.purpose === "disable") {
        const { error } = await authClient.twoFactor.disable({ password });
        if (error) return setError(errorMessage(error, "Could not turn off two-factor sign-in."));
        await recordTwoFactorChange("disabled");
        toast.success("Two-factor sign-in is off.");
        close();
        router.refresh();
      } else {
        const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
        if (error || !data) return setError(errorMessage(error, "Could not create new backup codes."));
        setStep({ kind: "codes", backupCodes: data.backupCodes, justEnabled: false });
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== "scan") return;
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) return setError(errorMessage(error, "That code did not match."));
      await recordTwoFactorChange("enabled");
      setStep({ kind: "codes", backupCodes: step.backupCodes, justEnabled: true });
    } finally {
      setBusy(false);
    }
  }

  const dialogTitle =
    step.kind === "password"
      ? step.purpose === "enable"
        ? "Turn on two-factor sign-in"
        : step.purpose === "disable"
          ? "Turn off two-factor sign-in"
          : "New backup codes"
      : step.kind === "scan"
        ? "Scan with your authenticator app"
        : step.kind === "codes"
          ? "Save your backup codes"
          : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={enabled ? "text-success" : "text-muted"}>
            {enabled ? <ShieldCheck className="size-5" aria-hidden /> : <ShieldOff className="size-5" aria-hidden />}
          </span>
          <div>
            <p className="font-medium text-ink">
              Authenticator app{" "}
              {enabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}
            </p>
            <p className="text-sm text-muted">
              {enabled
                ? "You enter a 6-digit code from your app each time you sign in on a new device."
                : "Add a second step at sign-in with Google Authenticator, Microsoft Authenticator, 1Password or similar."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep({ kind: "password", purpose: "codes" })}>
                <KeyRound /> New backup codes
              </Button>
              <Button variant="outline" size="sm" onClick={() => setStep({ kind: "password", purpose: "disable" })}>
                Turn off
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setStep({ kind: "password", purpose: "enable" })}>
              Turn on
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={step.kind !== "idle"}
        onClose={() => {
          if (step.kind === "codes" && step.justEnabled) router.refresh();
          close();
        }}
        title={dialogTitle}
      >
        {step.kind === "password" ? (
          <form onSubmit={submitPassword} className="grid gap-4">
            <p className="text-sm text-ink-2">
              {step.purpose === "disable"
                ? "Your account will be protected by your password only."
                : step.purpose === "codes"
                  ? "Your old backup codes stop working as soon as new ones are created."
                  : "Confirm it is you before we create your authenticator secret."}
            </p>
            <Field label="Password" htmlFor="tf-password" error={error}>
              <Input id="tf-password" name="password" type="password" autoComplete="current-password" required autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant={step.purpose === "disable" ? "danger" : "primary"} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Continue
              </Button>
            </div>
          </form>
        ) : null}

        {step.kind === "scan" ? (
          <form onSubmit={submitCode} className="grid gap-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
              <li>Open your authenticator app and add a new account.</li>
              <li>Scan this QR code, or type the setup key.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="flex justify-center">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code for your authenticator app" width={224} height={224} className="rounded-lg border border-border bg-white p-2" />
              ) : (
                <div className="flex size-56 items-center justify-center rounded-lg border border-border">
                  <Loader2 className="size-5 animate-spin text-muted" aria-label="Creating QR code" />
                </div>
              )}
            </div>
            <div className="rounded-md bg-surface-2 p-3 text-center">
              <p className="text-xs text-muted">Setup key</p>
              <p className="mt-1 font-mono text-sm break-all text-ink select-all">{secretFromUri(step.totpURI)}</p>
            </div>
            <Field label="6-digit code" htmlFor="tf-code" error={error}>
              <Input
                id="tf-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                required
                className="text-center font-mono tracking-[0.4em]"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Verify and turn on
              </Button>
            </div>
          </form>
        ) : null}

        {step.kind === "codes" ? (
          <BackupCodes
            codes={step.backupCodes}
            justEnabled={step.justEnabled}
            onDone={() => {
              const refresh = step.justEnabled;
              close();
              if (refresh) router.refresh();
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function BackupCodes({ codes, justEnabled, onDone }: { codes: string[]; justEnabled: boolean; onDone: () => void }) {
  const text = `Vaakil AI backup codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`;
  return (
    <div className="grid gap-4">
      {justEnabled ? <Alert tone="success" title="Two-factor sign-in is on." /> : null}
      <p className="text-sm text-ink-2">
        If you lose your phone, each of these codes lets you sign in once. <strong className="text-ink">They are shown only now.</strong>
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm text-ink" aria-label="Backup codes">
        {codes.map((c) => (
          <li key={c} className="text-center select-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join("\n"));
              toast.success("Backup codes copied.");
            } catch {
              toast.error("Copy failed. Select the codes and copy them manually.");
            }
          }}
        >
          <Copy /> Copy
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "vaakil-backup-codes.txt";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download /> Download
        </Button>
        <Button type="button" size="sm" onClick={onDone}>
          I have saved them
        </Button>
      </div>
    </div>
  );
}
