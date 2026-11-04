"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Loader2, Plus, ReceiptIndianRupee, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { computeInvoiceTotals, formatRateBp, parseRupeesToPaise, REVERSE_CHARGE_NOTE, rupeesInWords, type GstMode } from "@/lib/fees/money";
import { formatINR } from "@/lib/utils";
import { createInvoice } from "@/app/app/fees/actions";
import { GstModePicker } from "./gst-mode-picker";

export type BuilderClient = { id: string; name: string; kind: string; address: string | null; gstin: string | null; email: string | null };
export type BuilderMatter = { id: string; title: string; clientId: string | null; status: string };

type Item = { key: number; description: string; amount: string };

const SUGGESTIONS = ["Professional fee", "Appearance fee", "Drafting and filing", "Legal opinion", "Consultation", "Conference with client", "Clerkage"];

export function InvoiceBuilder({
  clients,
  matters,
  profile,
  defaults,
}: {
  clients: BuilderClient[];
  matters: BuilderMatter[];
  profile: { gstin: string | null; upiId: string | null; invoicePrefix: string; fyLabel: string };
  defaults: { clientId?: string; matterId?: string; issueDate: string; dueDate: string };
}) {
  const router = useRouter();
  const uid = useId();
  const f = (n: string) => `${uid}-${n}`;
  const nextKey = useRef(2);
  const initialClient = clients.find((c) => c.id === defaults.clientId);

  const [clientId, setClientId] = useState(initialClient?.id ?? "");
  const [billTo, setBillTo] = useState({
    name: initialClient?.name ?? "",
    address: initialClient?.address ?? "",
    gstin: initialClient?.gstin ?? "",
    email: initialClient?.email ?? "",
  });
  const [matterId, setMatterId] = useState(defaults.matterId ?? "");
  const [items, setItems] = useState<Item[]>([{ key: 1, description: "Professional fee", amount: "" }]);
  const [gstMode, setGstMode] = useState<GstMode>(initialClient?.kind === "business" ? "reverse_charge" : "none");
  const [gstTouched, setGstTouched] = useState(false);
  const [gstRate, setGstRate] = useState("18");
  const [issueDate, setIssueDate] = useState(defaults.issueDate);
  const [dueDate, setDueDate] = useState(defaults.dueDate);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const pickClient = (id: string, keepMatter = false) => {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    setBillTo({ name: c.name, address: c.address ?? "", gstin: c.gstin ?? "", email: c.email ?? "" });
    if (!gstTouched) setGstMode(c.kind === "business" ? "reverse_charge" : "none");
    // Keep the matter only if it belongs to the newly picked client (or to nobody).
    const m = matters.find((x) => x.id === matterId);
    if (!keepMatter && m?.clientId && m.clientId !== id) setMatterId("");
  };

  const pickMatter = (id: string) => {
    setMatterId(id);
    const m = matters.find((x) => x.id === id);
    if (m?.clientId && !clientId) pickClient(m.clientId, true);
  };

  const { forClient, others } = useMemo(() => {
    const forClient = clientId ? matters.filter((m) => m.clientId === clientId) : [];
    const others = matters.filter((m) => !forClient.includes(m));
    return { forClient, others };
  }, [matters, clientId]);

  const parsed = items.map((i) => parseRupeesToPaise(i.amount));
  const rateBp = Math.round((Number(gstRate) || 0) * 100);
  const totals = computeInvoiceTotals(
    parsed.map((p) => p ?? 0),
    gstMode,
    rateBp,
  );

  const setItem = (key: number, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const addItem = () => setItems((list) => (list.length >= 30 ? list : [...list, { key: nextKey.current++, description: "", amount: "" }]));
  const removeItem = (key: number) => setItems((list) => (list.length <= 1 ? list : list.filter((i) => i.key !== key)));

  const submit = () =>
    start(async () => {
      const r = await createInvoice({
        clientId: clientId || undefined,
        matterId: matterId || undefined,
        billTo,
        items: items.map(({ description, amount }) => ({ description, amount })),
        gstMode,
        gstRate,
        issueDate,
        dueDate: dueDate || undefined,
        notes,
      });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(`Fee memo ${r.data.number} issued`);
      router.push(`/app/fees/${r.data.id}`);
    });

  const err = (k: string) => errors[k];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      noValidate
    >
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bill to</CardTitle>
            <CardDescription>Pick a client from your register, or type the details for someone else.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Client" htmlFor={f("client")} error={err("clientId")} className="sm:col-span-2">
              <Select id={f("client")} value={clientId} onChange={(e) => (e.target.value ? pickClient(e.target.value) : setClientId(""))}>
                <option value="">Not in my register</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.kind === "business" ? " (business)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" htmlFor={f("bt-name")} required error={err("billTo.name")} className="sm:col-span-2">
              <Input id={f("bt-name")} value={billTo.name} onChange={(e) => setBillTo({ ...billTo, name: e.target.value })} maxLength={200} required autoComplete="off" />
            </Field>
            <Field label="Address" htmlFor={f("bt-address")} error={err("billTo.address")} className="sm:col-span-2">
              <Textarea id={f("bt-address")} value={billTo.address} onChange={(e) => setBillTo({ ...billTo, address: e.target.value })} maxLength={1000} rows={2} className="min-h-16" />
            </Field>
            <Field
              label="Client GSTIN"
              htmlFor={f("bt-gstin")}
              error={err("billTo.gstin")}
              hint={gstMode === "reverse_charge" && !billTo.gstin.trim() ? "Add the client's GSTIN for a reverse-charge memo." : undefined}
            >
              <Input
                id={f("bt-gstin")}
                value={billTo.gstin}
                onChange={(e) => setBillTo({ ...billTo, gstin: e.target.value.toUpperCase() })}
                maxLength={20}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="font-mono tabular"
              />
            </Field>
            <Field label="Email" htmlFor={f("bt-email")} error={err("billTo.email")}>
              <Input id={f("bt-email")} type="email" value={billTo.email} onChange={(e) => setBillTo({ ...billTo, email: e.target.value })} maxLength={200} autoComplete="off" />
            </Field>
            <Field label="Matter (optional)" htmlFor={f("matter")} error={err("matterId")} className="sm:col-span-2">
              <Select id={f("matter")} value={matterId} onChange={(e) => pickMatter(e.target.value)}>
                <option value="">No matter</option>
                {forClient.length > 0 ? (
                  <optgroup label="This client's matters">
                    {forClient.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                        {m.status === "closed" ? " (closed)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {others.length > 0 ? (
                  <optgroup label={forClient.length > 0 ? "Other matters" : "Matters"}>
                    {others.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                        {m.status === "closed" ? " (closed)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <CardDescription>One line per piece of work. Fees cannot depend on the result of the case (BCI Rule 20).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <datalist id={f("suggest")}>
              {SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {err("items") ? (
              <p className="text-[13px] text-danger" role="alert">
                {err("items")}
              </p>
            ) : null}
            <ol className="space-y-3">
              {items.map((it, idx) => {
                const amountError = err(`items.${idx}.amount`) ?? (it.amount.trim() && parsed[idx] === null ? "Enter an amount like 25000 or 25000.50" : undefined);
                return (
                  <li key={it.key} className="grid gap-2 rounded-md border border-border bg-surface-2/40 p-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-start sm:border-0 sm:bg-transparent sm:p-0">
                    <Field label={`Item ${idx + 1}`} htmlFor={f(`d-${it.key}`)} error={err(`items.${idx}.description`)}>
                      <Input
                        id={f(`d-${it.key}`)}
                        value={it.description}
                        onChange={(e) => setItem(it.key, { description: e.target.value })}
                        list={f("suggest")}
                        maxLength={500}
                        placeholder="e.g. Appearance on 12 Nov 2026"
                      />
                    </Field>
                    <Field label="Amount (₹)" htmlFor={f(`a-${it.key}`)} error={amountError}>
                      <Input
                        id={f(`a-${it.key}`)}
                        value={it.amount}
                        onChange={(e) => setItem(it.key, { amount: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        className="text-right tabular"
                        aria-invalid={amountError ? true : undefined}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(it.key)}
                      disabled={items.length <= 1}
                      aria-label={`Remove item ${idx + 1}`}
                      className="justify-self-end text-muted hover:text-danger sm:mt-6"
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ol>
            <Button type="button" variant="secondary" onClick={addItem} disabled={items.length >= 30}>
              <Plus /> Add item
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>GST and dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <GstModePicker
              value={gstMode}
              onChange={(v) => {
                setGstTouched(true);
                setGstMode(v);
              }}
            />
            {err("gstMode") ? (
              <p className="text-[13px] text-danger" role="alert">
                {err("gstMode")}
              </p>
            ) : null}
            {gstMode === "forward" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="GST rate (%)" htmlFor={f("rate")} error={err("gstRate")} hint="Legal services are usually 18%.">
                  <Input id={f("rate")} value={gstRate} onChange={(e) => setGstRate(e.target.value)} inputMode="decimal" className="tabular" />
                </Field>
                {!profile.gstin ? (
                  <p className="flex gap-2 self-center text-[13px] text-warning">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      Add your GSTIN in the{" "}
                      <Link href="/app/fees/settings" className="font-semibold underline">
                        billing profile
                      </Link>{" "}
                      before charging GST.
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs text-muted">
              General information only (CBIC notifications 12/2017 and 13/2017, Central Tax (Rate)): services of an advocate to a business entity are
              under reverse charge; most services to individuals are exempt. Check with your CA for your own case.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issue date" htmlFor={f("issue")} required error={err("issueDate")} hint="Decides the financial year in the memo number.">
                <Input id={f("issue")} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required className="tabular" />
              </Field>
              <Field label="Due date" htmlFor={f("due")} error={err("dueDate")} hint="Leave blank if payable on receipt.">
                <Input id={f("due")} type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} className="tabular" />
              </Field>
            </div>
            <Field label="Notes on the memo" htmlFor={f("notes")} error={err("notes")} hint="e.g. bank details for transfer, or terms agreed with the client.">
              <Textarea id={f("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription className="tabular">
              Number: {profile.invoicePrefix}/{profile.fyLabel}/… (assigned on issue)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatINR(totals.subtotalPaise)} />
              {gstMode === "forward" ? <Row label={`GST @ ${formatRateBp(rateBp)}`} value={formatINR(totals.taxPaise)} /> : null}
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="text-2xl font-semibold text-ink tabular">{formatINR(totals.totalPaise)}</dd>
              </div>
            </dl>
            <p className="text-[13px] text-muted">{rupeesInWords(totals.totalPaise)}</p>
            {gstMode === "reverse_charge" ? <p className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-ink-2">{REVERSE_CHARGE_NOTE}.</p> : null}
            {!profile.upiId ? (
              <p className="text-[13px] text-muted">
                Add a UPI ID in the{" "}
                <Link href="/app/fees/settings" className="font-semibold text-primary hover:underline">
                  billing profile
                </Link>{" "}
                to print a Pay by UPI code.
              </p>
            ) : null}
            <Button type="submit" size="lg" className="w-full" disabled={pending || totals.subtotalPaise <= 0}>
              {pending ? <Loader2 className="animate-spin" /> : <ReceiptIndianRupee />} Issue fee memo
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink tabular">{value}</dd>
    </div>
  );
}
