"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveAdvocateProfile, type AdvocateProfileInput } from "@/app/app/settings/advocate/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/overlay";
import { INDIAN_STATES, LANGUAGES, PRACTICE_AREAS, STATE_BAR_COUNCILS } from "@/lib/directory/constants";
import { cn } from "@/lib/utils";

export type AdvocateFormDefaults = {
  displayName: string;
  enrolmentNo: string;
  stateBarCouncil: string;
  enrolmentYear: number | null;
  practiceAreas: string[];
  courts: string[];
  languages: string[];
  city: string;
  state: string;
  bio: string;
  isListed: boolean;
  acceptsConsultations: boolean;
};

function ChipGroup({
  legend,
  options,
  value,
  onChange,
  error,
  hint,
}: {
  legend: string;
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-medium text-ink">
        {legend}
        <span className="ml-0.5 text-danger" aria-hidden>
          *
        </span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = value.includes(o);
          return (
            <label
              key={o}
              className={cn(
                "inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40",
                checked ? "border-primary bg-primary-soft text-primary" : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))}
              />
              {o}
            </label>
          );
        })}
      </div>
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </fieldset>
  );
}

export function AdvocateForm({ defaults, status }: { defaults: AdvocateFormDefaults | null; status: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [areas, setAreas] = useState<string[]>(defaults?.practiceAreas ?? []);
  const [languages, setLanguages] = useState<string[]>(defaults?.languages ?? []);
  const [isListed, setIsListed] = useState(defaults?.isListed ?? false);
  const [accepts, setAccepts] = useState(defaults?.acceptsConsultations ?? false);
  const [enrolmentNo, setEnrolmentNo] = useState(defaults?.enrolmentNo ?? "");
  const [council, setCouncil] = useState(defaults?.stateBarCouncil ?? "");

  const identityChanged =
    status === "verified" &&
    defaults !== null &&
    (enrolmentNo.trim().toUpperCase() !== defaults.enrolmentNo || council !== defaults.stateBarCouncil);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const yearRaw = String(fd.get("enrolmentYear") ?? "").trim();
    const input: AdvocateProfileInput = {
      displayName: String(fd.get("displayName") ?? ""),
      enrolmentNo,
      stateBarCouncil: council as AdvocateProfileInput["stateBarCouncil"],
      enrolmentYear: yearRaw ? Number(yearRaw) : null,
      practiceAreas: areas as AdvocateProfileInput["practiceAreas"],
      courts: String(fd.get("courts") ?? "")
        .split(/\n|;/)
        .map((s) => s.trim())
        .filter(Boolean),
      languages: languages as AdvocateProfileInput["languages"],
      city: String(fd.get("city") ?? ""),
      state: String(fd.get("state") ?? "") as AdvocateProfileInput["state"],
      bio: String(fd.get("bio") ?? ""),
      isListed,
      acceptsConsultations: accepts,
    };
    start(async () => {
      const res = await saveAdvocateProfile(input);
      if (res.ok) {
        setErrors({});
        toast.success(
          res.data.reset
            ? "Saved. Your profile is back in the review queue."
            : defaults
              ? "Profile saved."
              : "Application submitted. We will email you once it is reviewed.",
        );
        router.refresh();
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name on the roll" htmlFor="displayName" error={errors.displayName} required>
          <Input id="displayName" name="displayName" defaultValue={defaults?.displayName ?? ""} maxLength={100} required autoComplete="name" />
        </Field>
        <Field label="Enrolment number" htmlFor="enrolmentNo" error={errors.enrolmentNo} required hint="As on your Bar Council ID card, e.g. D/1234/2015.">
          <Input
            id="enrolmentNo"
            name="enrolmentNo"
            value={enrolmentNo}
            onChange={(e) => setEnrolmentNo(e.target.value)}
            maxLength={40}
            required
            autoCapitalize="characters"
            className="font-mono uppercase"
          />
        </Field>
        <Field label="State Bar Council" htmlFor="stateBarCouncil" error={errors.stateBarCouncil} required>
          <Select id="stateBarCouncil" name="stateBarCouncil" value={council} onChange={(e) => setCouncil(e.target.value)} required>
            <option value="" disabled>
              Choose a Bar Council
            </option>
            {STATE_BAR_COUNCILS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year of enrolment" htmlFor="enrolmentYear" error={errors.enrolmentYear}>
          <Input
            id="enrolmentYear"
            name="enrolmentYear"
            type="number"
            inputMode="numeric"
            min={1950}
            max={new Date().getFullYear()}
            defaultValue={defaults?.enrolmentYear ?? ""}
          />
        </Field>
      </div>

      {identityChanged ? (
        <Alert tone="warning" title="This sends your profile back for review">
          You are changing your enrolment number or State Bar Council. Your verified badge and directory listing are paused
          until an administrator checks the new details.
        </Alert>
      ) : null}

      <ChipGroup legend="Practice areas" options={PRACTICE_AREAS} value={areas} onChange={setAreas} error={errors.practiceAreas} hint="Up to 8." />
      <ChipGroup legend="Languages you consult in" options={LANGUAGES} value={languages} onChange={setLanguages} error={errors.languages} hint="Up to 8." />

      <Field label="Courts where you practise" htmlFor="courts" error={errors.courts} hint="One per line, e.g. Delhi High Court, District Court Saket. Up to 10.">
        <Textarea id="courts" name="courts" rows={3} defaultValue={(defaults?.courts ?? []).join("\n")} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="City" htmlFor="city" error={errors.city}>
          <Input id="city" name="city" defaultValue={defaults?.city ?? ""} maxLength={80} autoComplete="address-level2" />
        </Field>
        <Field label="State / UT" htmlFor="state" error={errors.state}>
          <Select id="state" name="state" defaultValue={defaults?.state ?? ""}>
            <option value="">Select</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="About your practice" htmlFor="bio" error={errors.bio} hint="Factual only: no fees, success rates, comparisons or claims of being the best (BCI Rule 36). Up to 1,000 characters.">
        <Textarea id="bio" name="bio" rows={4} maxLength={1000} defaultValue={defaults?.bio ?? ""} />
      </Field>

      <div className="grid gap-3 rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="listed-label" className="text-sm font-medium text-ink">
              List me in the advocate directory
            </p>
            <p className="text-sm text-muted">Only after verification. Shown alphabetically, never ranked or promoted.</p>
          </div>
          <Switch checked={isListed} onChange={setIsListed} label="List me in the advocate directory" />
        </div>
        <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium text-ink">Accept consultation requests</p>
            <p className="text-sm text-muted">Signed-in users can send you a request; you choose whether to accept.</p>
          </div>
          <Switch checked={accepts} onChange={setAccepts} label="Accept consultation requests" />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {defaults ? (status === "rejected" ? "Resubmit for review" : "Save profile") : "Submit for verification"}
        </Button>
      </div>
    </form>
  );
}
