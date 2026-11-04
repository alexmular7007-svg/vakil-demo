"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Building2, Loader2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { createClient, deleteClient, updateClient } from "@/app/app/clients/actions";

export type ClientRecord = {
  id: string;
  name: string;
  kind: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  notes: string | null;
};

const kinds = [
  { value: "individual", label: "Individual", icon: UserRound, hint: "A person or family" },
  { value: "business", label: "Business", icon: Building2, hint: "Company, firm, LLP or trust" },
] as const;

export function ClientFields({ client, errors }: { client?: ClientRecord; errors?: Record<string, string> }) {
  const [kind, setKind] = useState(client?.kind === "business" ? "business" : "individual");
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset className="grid gap-1.5 sm:col-span-2">
        <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">Client type</legend>
        <div className="grid grid-cols-2 gap-2">
          {kinds.map((k) => (
            <label
              key={k.value}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border-input/50 bg-surface px-3 py-2.5 transition-colors",
                "has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-4 has-focus-visible:ring-ring/15",
              )}
            >
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
              <k.icon className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{k.label}</span>
                <span className="block truncate text-xs text-muted">{k.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={kind === "business" ? "Business name" : "Full name"} htmlFor={f("name")} required error={errors?.name} className="sm:col-span-2">
        <Input id={f("name")} name="name" defaultValue={client?.name} required minLength={2} maxLength={200} autoComplete="off" />
      </Field>
      <Field label="Phone" htmlFor={f("phone")} error={errors?.phone}>
        <Input id={f("phone")} name="phone" type="tel" inputMode="tel" defaultValue={client?.phone ?? ""} maxLength={30} autoComplete="off" className="tabular" />
      </Field>
      <Field label="Email" htmlFor={f("email")} error={errors?.email}>
        <Input id={f("email")} name="email" type="email" defaultValue={client?.email ?? ""} maxLength={200} autoComplete="off" />
      </Field>
      <Field label="Address" htmlFor={f("address")} error={errors?.address} className="sm:col-span-2" hint="Printed in the bill-to block of fee memos.">
        <Textarea id={f("address")} name="address" defaultValue={client?.address ?? ""} maxLength={1000} rows={2} className="min-h-16" />
      </Field>
      {kind === "business" ? (
        <Field
          label="GSTIN"
          htmlFor={f("gstin")}
          error={errors?.gstin}
          className="sm:col-span-2"
          hint="Legal fees billed to a business are under reverse charge: the client pays the GST. Their GSTIN goes on the memo."
        >
          <Input
            id={f("gstin")}
            name="gstin"
            defaultValue={client?.gstin ?? ""}
            maxLength={20}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase tabular"
            placeholder="27AAPFU0939F1ZV"
          />
        </Field>
      ) : null}
      <Field label="Notes" htmlFor={f("notes")} className="sm:col-span-2">
        <Textarea id={f("notes")} name="notes" defaultValue={client?.notes ?? ""} maxLength={5000} rows={3} />
      </Field>
    </div>
  );
}

function ClientDialog({
  open,
  onClose,
  client,
}: {
  open: boolean;
  onClose: () => void;
  client?: ClientRecord;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>();
  const [pending, start] = useTransition();
  const close = () => {
    setErrors(undefined);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={client ? "Edit client" : "New client"}
      description={client ? undefined : "Only what you need to identify and bill the client."}
      className="w-[min(100%-2rem,40rem)]"
    >
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = client ? await updateClient(client.id, fd) : await createClient(fd);
              if (!r.ok) {
                setErrors(r.fieldErrors);
                toast.error(r.error);
                return;
              }
              close();
              if (client) {
                toast.success("Client saved");
                router.refresh();
              } else {
                toast.success("Client added");
                const created = r.data as { id: string };
                router.push(`/app/clients/${created.id}`);
              }
            });
          }}
          className="grid gap-5"
        >
          <ClientFields client={client} errors={errors} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} {client ? "Save changes" : "Add client"}
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}

export function NewClientButton({ variant = "primary" }: { variant?: "primary" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus /> New client
      </Button>
      <ClientDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function EditClientButton({ client }: { client: ClientRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil /> Edit
      </Button>
      <ClientDialog open={open} onClose={() => setOpen(false)} client={client} />
    </>
  );
}

export function DeleteClientButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setOpen(true)}>
        <Trash2 /> Delete
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this client?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep client
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteClient(id);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  setOpen(false);
                  toast.success("Client deleted");
                  router.push("/app/clients");
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete client
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          <span data-private className="font-semibold text-ink">
            {name}
          </span>{" "}
          will be removed from your register. Their matters, fee memos and receipts stay in your books, unlinked from this record.
        </p>
      </Dialog>
    </>
  );
}
