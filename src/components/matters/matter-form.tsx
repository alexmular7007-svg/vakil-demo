"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createMatter, listClientOptions, updateMatter } from "@/app/app/matters/actions";

type Matter = {
  id: string;
  title: string;
  clientName: string | null;
  court: string | null;
  caseNo: string | null;
  offenceDate: string | null;
  notes: string | null;
  clientId?: string | null;
  opposingParty?: string | null;
  cnr?: string | null;
};

export type MatterClientOption = { id: string; name: string };

function codeFor(date: string) {
  if (!date) return null;
  return date < "2024-07-01" ? "IPC, CrPC and Evidence Act govern (offence before 1 July 2024)" : "BNS, BNSS and BSA govern";
}

/** Uses the options passed in, or loads the user's clients once when none were passed. */
function useClientOptions(initial?: MatterClientOption[]) {
  const [loaded, setLoaded] = useState<MatterClientOption[] | null>(null);
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    listClientOptions()
      .then((r) => {
        if (!cancelled) setLoaded(r.ok ? r.data : []);
      })
      .catch(() => {
        if (!cancelled) setLoaded([]);
      });
    return () => {
      cancelled = true;
    };
  }, [initial]);
  return initial ?? loaded;
}

export function MatterFields({
  matter,
  errors,
  clients,
  defaultClientId,
}: {
  matter?: Matter;
  errors?: Record<string, string>;
  /** The user's clients for the "Linked client" picker. Loaded on demand when omitted. */
  clients?: MatterClientOption[];
  defaultClientId?: string;
}) {
  const options = useClientOptions(clients);
  const initialClientId = matter?.clientId ?? defaultClientId ?? "";
  const [date, setDate] = useState(matter?.offenceDate ?? "");
  const [clientId, setClientId] = useState(initialClientId);
  const [clientName, setClientName] = useState(
    matter?.clientName ?? (defaultClientId ? (clients?.find((c) => c.id === defaultClientId)?.name ?? "") : ""),
  );
  const [cnr, setCnr] = useState(matter?.cnr ?? "");
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  const nameOf = (id: string) => options?.find((c) => c.id === id)?.name ?? "";

  const onPickClient = (id: string) => {
    const prevName = nameOf(clientId);
    setClientId(id);
    // Fill the free-text name from the register unless the user typed something of their own.
    if (!clientName.trim() || clientName === prevName) setClientName(nameOf(id));
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title" htmlFor={f("title")} required error={errors?.title} className="sm:col-span-2">
        <Input id={f("title")} name="title" defaultValue={matter?.title} required maxLength={200} placeholder="e.g. State v. Sharma: bail" />
      </Field>
      <Field
        label="Linked client"
        htmlFor={f("clientId")}
        error={errors?.clientId}
        hint={
          options && options.length === 0 ? (
            <>
              No clients yet.{" "}
              <Link href="/app/clients" className="font-semibold text-primary hover:underline">
                Add one in the Clients register
              </Link>
            </>
          ) : (
            "Links fee memos and the conflict check to this client."
          )
        }
      >
        <Select id={f("clientId")} name="clientId" value={clientId} onChange={(e) => onPickClient(e.target.value)} disabled={options === null && !clientId}>
          <option value="">Not linked</option>
          {options === null ? (
            clientId ? <option value={clientId}>Loading clients…</option> : null
          ) : (
            options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))
          )}
        </Select>
      </Field>
      <Field label="Client name (as it appears in the case)" htmlFor={f("clientName")} error={errors?.clientName}>
        <Input id={f("clientName")} name="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} maxLength={200} />
      </Field>
      <Field label="Opposing party" htmlFor={f("opposingParty")} error={errors?.opposingParty} hint="Used by the conflict check.">
        <Input id={f("opposingParty")} name="opposingParty" defaultValue={matter?.opposingParty ?? ""} maxLength={300} placeholder="e.g. State of Uttar Pradesh" />
      </Field>
      <Field label="Court / forum" htmlFor={f("court")}>
        <Input id={f("court")} name="court" defaultValue={matter?.court ?? ""} maxLength={200} placeholder="e.g. Sessions Court, Lucknow" />
      </Field>
      <Field label="Case number" htmlFor={f("caseNo")}>
        <Input id={f("caseNo")} name="caseNo" defaultValue={matter?.caseNo ?? ""} maxLength={120} />
      </Field>
      <Field label="CNR (eCourts)" htmlFor={f("cnr")} error={errors?.cnr} hint="16 letters and digits, from the eCourts case status page.">
        <Input
          id={f("cnr")}
          name="cnr"
          value={cnr}
          onChange={(e) => setCnr(e.target.value.toUpperCase())}
          maxLength={24}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono tabular"
          placeholder="DLHC010012342024"
          aria-invalid={errors?.cnr ? true : undefined}
        />
      </Field>
      <Field label="Date of offence (criminal matters)" htmlFor={f("offenceDate")} error={errors?.offenceDate} hint={codeFor(date) ?? "Decides whether the IPC or the BNS applies."}>
        <Input id={f("offenceDate")} name="offenceDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Notes" htmlFor={f("notes")} className="sm:col-span-2">
        <Textarea id={f("notes")} name="notes" defaultValue={matter?.notes ?? ""} maxLength={5000} rows={4} />
      </Field>
    </div>
  );
}

/** Opens the full-page new-matter form. */
export function NewMatterButton({ clientId }: { clientId?: string } = {}) {
  return (
    <Button asChild>
      <Link href={clientId ? `/app/matters/new?client=${clientId}` : "/app/matters/new"}>
        <Plus /> New matter
      </Link>
    </Button>
  );
}

export function NewMatterForm({ clients, defaultClientId }: { clients: MatterClientOption[]; defaultClientId?: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>();
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await createMatter(fd);
          if (!r.ok) {
            setErrors(r.fieldErrors);
            toast.error(r.error);
            return;
          }
          toast.success("Matter created");
          router.push(`/app/matters/${r.data.id}`);
        });
      }}
      className="grid gap-5"
    >
      <MatterFields errors={errors} clients={clients} defaultClientId={defaultClientId} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Create matter
        </Button>
      </div>
    </form>
  );
}

export function EditMatterForm({ matter, clients }: { matter: Matter; clients?: MatterClientOption[] }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>();
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await updateMatter(matter.id, fd);
          if (!r.ok) {
            setErrors(r.fieldErrors);
            toast.error(r.error);
            return;
          }
          setErrors(undefined);
          toast.success("Matter saved");
          router.refresh();
        });
      }}
      className="grid gap-5"
    >
      <MatterFields matter={matter} errors={errors} clients={clients} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save changes
        </Button>
      </div>
    </form>
  );
}
