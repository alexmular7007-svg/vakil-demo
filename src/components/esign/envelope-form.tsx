"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePen, FileUp, Fingerprint, Loader2, ShieldCheck, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  AADHAAR_UNAVAILABLE,
  DEFAULT_EXPIRY_DAYS,
  DOC_CATEGORIES,
  EXCLUDED_EXPLANATION,
  LEGAL_FRAMING,
  MAX_EXPIRY_DAYS,
  MIN_EXPIRY_DAYS,
  findCategory,
  type SignatureType,
} from "@/lib/esign/constants";
import { envelopeInputSchema } from "@/lib/esign/schemas";
import { defaultRecipients } from "@/lib/esign/workflow";
import { cn, formatBytes } from "@/lib/utils";
import { RecipientsEditor, makeRecipient, type EditableRecipient } from "./recipients-editor";

type DraftSource = { id: string; title: string; unsupported: boolean } | null;

function defaults(): EditableRecipient[] {
  return defaultRecipients().map((r) => makeRecipient(r));
}

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = i.path.map(String).join(".") || "_";
    out[k] ??= i.message;
  }
  return out;
}

export function EnvelopeForm({
  draft,
  draftMissing,
  aadhaarAvailable,
  aadhaarLabel,
  maxUploadMb,
}: {
  draft: DraftSource;
  draftMissing: boolean;
  aadhaarAvailable: boolean;
  aadhaarLabel: string;
  maxUploadMb: number;
}) {
  const router = useRouter();
  const titleId = useId();
  const categoryId = useId();
  const messageId = useId();
  const expiryId = useId();
  const fileId = useId();
  const ids = { title: titleId, category: categoryId, message: messageId, expiry: expiryId, file: fileId };
  const [title, setTitle] = useState(draft?.title ?? "");
  const [docCategory, setDocCategory] = useState("");
  const [message, setMessage] = useState("");
  const [expiryDays, setExpiryDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
  const [signatureType, setSignatureType] = useState<SignatureType>("electronic");
  const [source, setSource] = useState<"upload" | "draft">(draft && !draft.unsupported ? "draft" : "upload");
  const [file, setFile] = useState<File | null>(null);
  const [recipients, setRecipients] = useState<EditableRecipient[]>(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const category = useMemo(() => findCategory(docCategory), [docCategory]);
  const excluded = Boolean(category?.excluded);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setErrors((x) => ({ ...x, file: "" }));
    if (!f) return setFile(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      setErrors((x) => ({ ...x, file: "Choose a PDF file." }));
      e.target.value = "";
      return setFile(null);
    }
    if (f.size > maxUploadMb * 1024 * 1024) {
      setErrors((x) => ({ ...x, file: `The PDF is larger than ${maxUploadMb} MB.` }));
      e.target.value = "";
      return setFile(null);
    }
    setFile(f);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const payload = {
      title,
      message,
      docCategory,
      expiryDays,
      signatureType,
      draftId: source === "draft" && draft ? draft.id : null,
      recipients: recipients.map((r) => ({
        name: r.name,
        email: r.advocateUserId ? "" : r.email,
        roleLabel: r.roleLabel,
        action: r.action,
        routingOrder: r.routingOrder,
        advocateUserId: r.advocateUserId,
      })),
    };
    const parsed = envelopeInputSchema.safeParse(payload);
    const fe = parsed.success ? {} : fieldErrorsFrom(parsed.error.issues);
    if (source === "upload" && !file) fe.file = "Choose the PDF to send.";
    if (Object.keys(fe).length) {
      setErrors(fe);
      setFormError("Please check the highlighted fields.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true'], [role='alert']")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("payload", JSON.stringify(payload));
      if (source === "upload" && file) body.set("file", file);
      const res = await fetch("/api/esign/envelopes", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as { ok: boolean; id?: string; error?: string; fieldErrors?: Record<string, string> } | null;
      if (!res.ok || !data?.ok || !data.id) {
        setErrors(data?.fieldErrors ?? {});
        setFormError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      toast.success("Draft saved. Review it, then send.");
      router.push(`/app/sign/${data.id}`);
    } catch {
      setFormError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start" noValidate>
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Document</CardTitle>
            <CardDescription>The exact PDF bytes are fingerprinted (SHA-256) now and locked when you send.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {draftMissing ? <Alert tone="warning">That draft was not found. Upload a PDF instead.</Alert> : null}
            {draft?.unsupported ? (
              <Alert tone="info" title="Export this draft as a PDF first">
                “{draft.title}” contains Hindi or other non-Latin text. Standard PDF fonts cannot shape Devanagari, so open the draft, export it as
                a PDF and upload that file below.
              </Alert>
            ) : null}
            {draft && !draft.unsupported ? (
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Document source">
                {(
                  [
                    { v: "draft", icon: FilePen, t: "Use my draft", d: draft.title },
                    { v: "upload", icon: FileUp, t: "Upload a PDF", d: `Up to ${maxUploadMb} MB` },
                  ] as const
                ).map((o) => (
                  <label
                    key={o.v}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40",
                      source === o.v ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <input type="radio" name="source" value={o.v} checked={source === o.v} onChange={() => setSource(o.v)} className="sr-only" />
                    <o.icon className={cn("mt-0.5 size-4 shrink-0", source === o.v ? "text-primary" : "text-muted")} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{o.t}</span>
                      <span className="block truncate text-xs text-muted">{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            {source === "draft" && draft ? (
              <p className="text-[13px] text-muted">
                We will render the draft’s English text as an A4 PDF with standard fonts. Check the PDF on the next screen before sending.
              </p>
            ) : (
              <Field label="PDF file" htmlFor={ids.file} error={errors.file || null} required hint={`PDF only, up to ${maxUploadMb} MB. Password-protected PDFs cannot be used.`}>
                {file ? (
                  <div className="flex items-center gap-3 rounded-md border border-border-strong bg-surface px-3 py-2">
                    <FileUp className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{file.name}</span>
                      <span className="block text-xs text-muted">{formatBytes(file.size)}</span>
                    </span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} aria-label="Remove file">
                      <X aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <Input
                    id={ids.file}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={onFile}
                    className="h-auto py-2 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
                    aria-invalid={Boolean(errors.file) || undefined}
                  />
                )}
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Title" htmlFor={ids.title} error={errors.title} required hint="Recipients see this in the email and on the signing page.">
              <Input id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={Boolean(errors.title) || undefined} />
            </Field>
            <Field label="Kind of document" htmlFor={ids.category} error={excluded ? null : errors.docCategory} required>
              <Select id={ids.category} value={docCategory} onChange={(e) => setDocCategory(e.target.value)} aria-invalid={Boolean(errors.docCategory) || excluded || undefined}>
                <option value="" disabled>
                  Choose…
                </option>
                <optgroup label="Can be e-signed">
                  {DOC_CATEGORIES.filter((c) => !c.excluded).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Cannot be e-signed (IT Act, First Schedule)">
                  {DOC_CATEGORIES.filter((c) => c.excluded).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>
            {excluded ? (
              <Alert tone="danger" title="This document cannot be signed electronically">
                {EXCLUDED_EXPLANATION}
              </Alert>
            ) : category?.warning ? (
              <Alert tone="warning" title="Stamping and registration">
                {category.warning}
              </Alert>
            ) : null}
            <Field label="Message to recipients" htmlFor={ids.message} error={errors.message} hint="Optional. Included in the email.">
              <Textarea id={ids.message} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={3} />
            </Field>
            <Field
              label="Expires after (days)"
              htmlFor={ids.expiry}
              error={errors.expiryDays}
              hint={`Counted from when you send. ${MIN_EXPIRY_DAYS}–${MAX_EXPIRY_DAYS} days.`}
              className="sm:max-w-56"
            >
              <Input
                id={ids.expiry}
                type="number"
                inputMode="numeric"
                min={MIN_EXPIRY_DAYS}
                max={MAX_EXPIRY_DAYS}
                value={Number.isFinite(expiryDays) ? expiryDays : ""}
                onChange={(e) => setExpiryDays(e.target.value === "" ? NaN : Number(e.target.value))}
                aria-invalid={Boolean(errors.expiryDays) || undefined}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recipients and order</CardTitle>
            <CardDescription>
              Default: the lawyer reviews first, then the sender and receiver sign at the same time. Higher steps wait until lower steps finish.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecipientsEditor value={recipients} onChange={setRecipients} errors={errors} onReset={() => setRecipients(defaults())} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5 lg:sticky lg:top-6">
        <Card>
          <CardHeader>
            <CardTitle>Signature type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2" role="radiogroup" aria-label="Signature type">
            <label
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40",
                signatureType === "electronic" ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2",
              )}
            >
              <input type="radio" name="sigtype" checked={signatureType === "electronic"} onChange={() => setSignatureType("electronic")} className="sr-only" />
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-ink">Tier-2 electronic signature</span>
                <span className="block text-xs text-muted">Email OTP, consent, typed or drawn signature, hash-chained audit trail.</span>
              </span>
            </label>
            <label
              className={cn(
                "flex gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40",
                !aadhaarAvailable ? "cursor-not-allowed border-border opacity-80" : "cursor-pointer",
                signatureType === "aadhaar" ? "border-primary bg-primary-soft" : "border-border",
              )}
            >
              <input
                type="radio"
                name="sigtype"
                checked={signatureType === "aadhaar"}
                onChange={() => setSignatureType("aadhaar")}
                disabled={!aadhaarAvailable}
                className="sr-only"
              />
              {aadhaarAvailable ? (
                <Fingerprint className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              )}
              <span>
                <span className="block text-sm font-medium text-ink">
                  {aadhaarLabel} {!aadhaarAvailable ? <span className="font-normal text-muted">(unavailable)</span> : null}
                </span>
                <span className="block text-xs text-muted">{aadhaarAvailable ? "Through the licensed aggregator configured on the server." : AADHAAR_UNAVAILABLE}</span>
              </span>
            </label>
            <p className="pt-1 text-[13px] text-muted">{LEGAL_FRAMING}</p>
          </CardContent>
        </Card>

        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Button type="submit" size="lg" className="w-full" disabled={submitting || excluded}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden /> : null} Save draft and review
        </Button>
        <p className="text-center text-[13px] text-muted">Nothing is sent until you press Send on the next screen.</p>
      </div>
    </form>
  );
}
