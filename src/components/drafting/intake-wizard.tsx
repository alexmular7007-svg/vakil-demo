"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { createDraftFromTemplate } from "@/app/app/drafts/actions";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatDateShort, validateInputs } from "@/lib/drafting/fill";
import type { MatterOption } from "@/lib/drafting/queries";
import { fieldGroups, type DraftLanguage, type TemplateField, type TemplateSummary } from "@/lib/drafting/types";
import { cn } from "@/lib/utils";
import { ReviewBadge } from "./review-badge";
import { Segmented } from "./segmented";

function initialValues(fields: TemplateField[], today: string): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) v[f.name] = f.defaultValue;
    else if (f.defaultToday) v[f.name] = today;
    else v[f.name] = "";
  }
  return v;
}

/** Suggests a distinguishing title: template name plus the first party named. */
function suggestTitle(t: TemplateSummary, values: Record<string, string>) {
  const party = t.fields.find((f) => f.type === "text" && f.name.endsWith("_name") && values[f.name]?.trim());
  const name = party ? values[party.name].trim() : "";
  const base = t.title.replace(/\s*\(.*\)\s*$/, "");
  return (name ? `${base} – ${name}` : base).slice(0, 200);
}

function displayValue(f: TemplateField, v: string) {
  if (!v.trim()) return null;
  if (f.type === "date") return formatDateShort(v);
  if (f.type === "select") return f.options?.find((o) => o.value === v)?.label ?? v;
  return v;
}

export function IntakeWizard({
  template,
  initialLanguage,
  matters,
  today,
  onBack,
}: {
  template: TemplateSummary;
  initialLanguage: DraftLanguage;
  matters: MatterOption[];
  today: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const groups = useMemo(() => fieldGroups(template.fields), [template.fields]);
  const steps = [...groups.map((g) => g.name), "Review"];
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(() => initialValues(template.fields, today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [language, setLanguage] = useState<DraftLanguage>(initialLanguage);
  const [matterId, setMatterId] = useState("");
  const [pending, start] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const isReview = step === groups.length;
  const effectiveTitle = title ?? suggestTitle(template, values);

  function go(to: number) {
    setStep(to);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function set(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
    if (errors[name]) {
      setErrors((prev) => {
        const nextErrors = { ...prev };
        delete nextErrors[name];
        return nextErrors;
      });
    }
  }

  function next() {
    const group = groups[step];
    const r = validateInputs(group.fields, values);
    if (!r.ok) {
      setErrors(r.errors);
      const first = group.fields.find((f) => r.errors[f.name]);
      if (first) document.getElementById(`f-${first.name}`)?.focus();
      return;
    }
    setErrors({});
    go(step + 1);
  }

  function submit() {
    const all = validateInputs(template.fields, values);
    if (!all.ok) {
      setErrors(all.errors);
      const firstStep = groups.findIndex((g) => g.fields.some((f) => all.errors[f.name]));
      if (firstStep >= 0) go(firstStep);
      return;
    }
    if (!effectiveTitle.trim()) {
      setFormError("Give the draft a title.");
      return;
    }
    setFormError(null);
    start(async () => {
      const res = await createDraftFromTemplate({
        templateSlug: template.slug,
        language,
        title: effectiveTitle.trim(),
        matterId: matterId || null,
        values,
      });
      if (!res.ok) {
        setFormError(res.error);
        if (res.fieldErrors) {
          setErrors(res.fieldErrors);
          const firstStep = groups.findIndex((g) => g.fields.some((f) => res.fieldErrors?.[f.name]));
          if (firstStep >= 0) go(firstStep);
        }
        return;
      }
      toast.success("Draft created. Review it, then save your changes as versions.");
      router.push(`/app/drafts/${res.data.id}`);
    });
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft /> All templates
      </Button>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{template.category}</Badge>
          <ReviewBadge reviewedBy={template.reviewedBy} />
        </div>
        <h2 className="font-serif text-xl font-semibold text-ink sm:text-2xl">{template.title}</h2>
        <p lang="hi" className="text-sm text-muted">
          {template.titleHi}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Step list (desktop) / progress (phones) */}
        <nav aria-label="Steps" className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-sm text-muted lg:hidden">
            Step {step + 1} of {steps.length}: <span className="font-medium text-ink">{steps[step]}</span>
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2 lg:hidden" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
          <ol className="hidden space-y-1 lg:block">
            {steps.map((s, i) => {
              const done = i < step;
              const reachable = i <= step;
              return (
                <li key={s}>
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => go(i)}
                    aria-current={i === step ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      i === step ? "bg-primary-soft font-medium text-primary" : reachable ? "cursor-pointer text-ink-2 hover:bg-surface-2" : "text-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                        done ? "border-primary bg-primary text-primary-ink" : i === step ? "border-primary text-primary" : "border-border-strong",
                      )}
                    >
                      {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                    </span>
                    {s}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <Card className="min-w-0 p-5 sm:p-6">
          <h3 ref={headingRef} tabIndex={-1} className="mb-4 font-serif text-lg font-semibold text-ink outline-none">
            {steps[step]}
          </h3>

          {!isReview ? (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              {groups[step].fields.map((f) => (
                <FieldInput key={f.name} field={f} value={values[f.name] ?? ""} error={errors[f.name]} onChange={(v) => set(f.name, v)} />
              ))}
              <div className="flex flex-col-reverse gap-2 pt-2 sm:col-span-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" onClick={() => (step === 0 ? onBack() : go(step - 1))}>
                  <ArrowLeft /> {step === 0 ? "Templates" : "Back"}
                </Button>
                <Button type="submit">
                  {step === groups.length - 1 ? "Review" : "Next"} <ArrowRight />
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {formError ? <Alert tone="danger">{formError}</Alert> : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Draft title" htmlFor="w-title" required className="sm:col-span-2">
                  <Input id="w-title" value={effectiveTitle} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium text-ink">Language</span>
                  <Segmented
                    label="Draft language"
                    value={language}
                    onChange={setLanguage}
                    className="w-fit"
                    options={[
                      { value: "en", label: "English" },
                      { value: "hi", label: "हिन्दी", lang: "hi", disabled: !template.hasHindi },
                    ]}
                  />
                  {!template.hasHindi ? <p className="text-[13px] text-muted">No Hindi version of this template yet.</p> : null}
                </div>
                <Field label="Matter (optional)" htmlFor="w-matter">
                  <Select id="w-matter" value={matterId} onChange={(e) => setMatterId(e.target.value)}>
                    <option value="">No matter</option>
                    {matters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                        {m.status === "closed" ? " (closed)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="space-y-4">
                {groups.map((g, gi) => (
                  <section key={g.name} aria-labelledby={`rev-${gi}`} className="rounded-lg border border-border">
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2">
                      <h4 id={`rev-${gi}`} className="text-sm font-semibold text-ink">
                        {g.name}
                      </h4>
                      <Button variant="ghost" size="sm" onClick={() => go(gi)} aria-label={`Edit ${g.name}`}>
                        <Pencil /> Edit
                      </Button>
                    </div>
                    <dl className="divide-y divide-border">
                      {g.fields.map((f) => {
                        const shown = displayValue(f, values[f.name] ?? "");
                        return (
                          <div key={f.name} className="grid gap-0.5 px-4 py-2 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-4">
                            <dt className="text-muted">{f.label}</dt>
                            <dd className={cn("break-words whitespace-pre-wrap text-ink", !shown && "text-muted italic")}>
                              {shown ?? (f.fallback === "" ? "Left out" : f.fallback !== undefined ? "Standard wording" : "Left blank (shown as a placeholder)")}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </section>
                ))}
              </div>

              <p className="text-sm text-muted">
                The draft opens in the editor, where you can change any wording. Fields left blank stay as highlighted placeholders.
              </p>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" onClick={() => go(step - 1)}>
                  <ArrowLeft /> Back
                </Button>
                <Button type="button" onClick={submit} disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : <Check />} Create draft
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function FieldInput({
  field: f,
  value,
  error,
  onChange,
}: {
  field: TemplateField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const id = `f-${f.name}`;
  const common = {
    id,
    name: f.name,
    "aria-invalid": error ? true : undefined,
    "aria-required": f.required || undefined,
  } as const;
  const wide = f.type === "textarea";
  return (
    <Field label={f.label} htmlFor={id} required={f.required} hint={f.help} error={error} className={wide ? "content-start sm:col-span-2" : "content-start"}>
      {f.type === "textarea" ? (
        <Textarea {...common} value={value} placeholder={f.placeholder} rows={4} onChange={(e) => onChange(e.target.value)} />
      ) : f.type === "select" ? (
        <Select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label.length > 90 ? `${o.label.slice(0, 88)}…` : o.label}
            </option>
          ))}
        </Select>
      ) : f.type === "date" ? (
        <Input {...common} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : f.type === "number" ? (
        <Input {...common} type="text" inputMode="decimal" value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input {...common} type="text" value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}
