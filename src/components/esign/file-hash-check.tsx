"use client";

import { useId, useState } from "react";
import { CheckCircle2, FileSearch, Loader2, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/display";
import { Input, Label } from "@/components/ui/form";

const MAX_CHECK_BYTES = 200 * 1024 * 1024;

function toHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash a chosen file in the browser (Web Crypto) and compare. Nothing is uploaded. */
export function FileHashCheck({ expected }: { expected: string }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ name: string; hash: string; isPdf: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const want = expected.trim().toLowerCase();
  const validExpected = /^[0-9a-f]{64}$/.test(want);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setResult(null);
    setError(null);
    if (!f) return;
    if (f.size === 0) {
      setError("That file is empty, so it cannot be the signed document.");
      return;
    }
    if (f.size > MAX_CHECK_BYTES) {
      setError("That file is too large to check in the browser.");
      return;
    }
    if (!globalThis.crypto?.subtle) {
      setError("Your browser can only compute a SHA-256 on a secure (https) page.");
      return;
    }
    setBusy(true);
    try {
      const bytes = await f.arrayBuffer();
      const head = new TextDecoder("latin1").decode(new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength)));
      setResult({ name: f.name, hash: toHex(await crypto.subtle.digest("SHA-256", bytes)), isPdf: head.includes("%PDF-") });
    } catch {
      setError("Your browser could not read that file. It may have been moved or be locked by another app; choose it again.");
    } finally {
      setBusy(false);
      // Choosing the same file again re-runs the check.
      e.target.value = "";
    }
  }

  const match = Boolean(result && validExpected && result.hash === want);

  if (!validExpected) {
    return <Alert tone="warning">No valid fingerprint is recorded for this envelope, so a copy cannot be checked here.</Alert>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Check a copy</Label>
        <Input
          id={id}
          type="file"
          accept="application/pdf,.pdf"
          onChange={onChange}
          className="h-auto py-2 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
        />
        <p className="text-[13px] text-muted">The file is fingerprinted on your device with Web Crypto. It is never uploaded.</p>
      </div>
      <div aria-live="polite">
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Computing SHA-256…
          </p>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {result ? (
          match ? (
            <Alert tone="success" title="Match: this is the final signed document">
              <span className="flex items-start gap-1.5 break-all">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                <code className="font-mono text-[12px]">{result.hash}</code>
              </span>
            </Alert>
          ) : (
            <Alert tone="danger" title="No match">
              <p className="break-all">
                <XCircle className="mr-1 inline size-3.5 text-danger" aria-hidden />
                {result.name}: <code className="font-mono text-[12px]">{result.hash}</code>
              </p>
              <p className="mt-1">
                {result.isPdf
                  ? "This file differs from the completed document. Even a one-byte change gives a different fingerprint."
                  : "This file is not a PDF, so it cannot be the completed document."}
              </p>
            </Alert>
          )
        ) : null}
        {!result && !busy && !error ? (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <FileSearch className="size-4" aria-hidden /> Choose a PDF to compare.
          </p>
        ) : null}
      </div>
    </div>
  );
}
