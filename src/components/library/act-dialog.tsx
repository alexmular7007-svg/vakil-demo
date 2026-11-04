"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { createAct, updateAct, type ActInput } from "@/app/admin/library/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";

type Initial = {
  id: string;
  title: string;
  shortTitle: string;
  actNo: string | null;
  year: number;
  inForceFrom: string | null;
  sourceUrl: string;
  sourceNote: string | null;
};

/** Add an act, or edit an act's details (title, numbers, source). Section text is edited separately. */
export function ActDialog({ mode, initial }: { mode: "create" | "edit"; initial?: Initial }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const f = (k: string) => `act-${mode}-${k}`;

  return (
    <>
      {mode === "create" ? (
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus /> Add act
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <Pencil /> Edit details
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={mode === "create" ? "Add an act" : "Edit act details"}
        description={mode === "create" ? "Then add its sections one by one or paste the whole act." : "Changes are written to the audit log."}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const s = (k: string) => String(fd.get(k) ?? "");
            const input: ActInput = {
              id: mode === "edit" && initial ? initial.id : s("id"),
              title: s("title"),
              shortTitle: s("shortTitle"),
              actNo: s("actNo"),
              year: s("year"),
              inForceFrom: s("inForceFrom"),
              sourceUrl: s("sourceUrl"),
              sourceNote: s("sourceNote"),
              tracked: fd.get("tracked") === "on",
            };
            start(async () => {
              if (mode === "create") {
                const res = await createAct(input);
                if (!res.ok) {
                  setErrors(res.fieldErrors ?? {});
                  toast.error(res.error);
                  return;
                }
                toast.success("Act added.");
                setOpen(false);
                router.push(`/admin/library/acts/${res.data.id}`);
              } else {
                const res = await updateAct(input);
                if (!res.ok) {
                  setErrors(res.fieldErrors ?? {});
                  toast.error(res.error);
                  return;
                }
                toast.success("Details saved.");
                setOpen(false);
                router.refresh();
              }
            });
          }}
        >
          {mode === "create" ? (
            <Field label="Act id" htmlFor={f("id")} required error={errors.id} hint="Short and permanent, e.g. BNS2 or POCSO. Capital letters and digits.">
              <Input id={f("id")} name="id" required maxLength={16} autoCapitalize="characters" autoComplete="off" className="font-mono uppercase" />
            </Field>
          ) : null}
          <Field label="Full title" htmlFor={f("title")} required error={errors.title}>
            <Input id={f("title")} name="title" required maxLength={300} defaultValue={initial?.title} placeholder="The Bharatiya Nyaya Sanhita (Amendment) Act, 2026" />
          </Field>
          <Field label="Short title" htmlFor={f("shortTitle")} required error={errors.shortTitle}>
            <Input id={f("shortTitle")} name="shortTitle" required maxLength={160} defaultValue={initial?.shortTitle} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Act number" htmlFor={f("actNo")} error={errors.actNo}>
              <Input id={f("actNo")} name="actNo" maxLength={120} defaultValue={initial?.actNo ?? ""} placeholder="Act No. 12 of 2026" />
            </Field>
            <Field label="Year" htmlFor={f("year")} required error={errors.year}>
              <Input id={f("year")} name="year" type="number" inputMode="numeric" min={1800} max={2100} required defaultValue={initial?.year} className="tabular" />
            </Field>
          </div>
          <Field label="In force from" htmlFor={f("inForceFrom")} error={errors.inForceFrom}>
            <Input id={f("inForceFrom")} name="inForceFrom" type="date" defaultValue={initial?.inForceFrom ?? ""} />
          </Field>
          <Field label="Source link" htmlFor={f("sourceUrl")} required error={errors.sourceUrl} hint="Official text, ideally the India Code page.">
            <Input id={f("sourceUrl")} name="sourceUrl" type="url" required maxLength={500} defaultValue={initial?.sourceUrl} placeholder="https://www.indiacode.nic.in/handle/…" />
          </Field>
          <Field label="Source note" htmlFor={f("sourceNote")} error={errors.sourceNote} hint="Shown with the act, e.g. which amendments the text includes.">
            <Textarea id={f("sourceNote")} name="sourceNote" rows={2} maxLength={1000} defaultValue={initial?.sourceNote ?? ""} />
          </Field>
          {mode === "create" ? (
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink-2">
              <Checkbox name="tracked" /> Check this act against India Code for amendments
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {mode === "create" ? "Add act" : "Save details"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
