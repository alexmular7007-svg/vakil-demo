import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { ArrowLeft, Briefcase, Building2, ChevronRight, Contact, Mail, MapPin, Phone, Plus, ReceiptIndianRupee, StickyNote } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { loadClient } from "@/lib/clients/queries";
import { listInvoices, listReceipts } from "@/lib/fees/queries";
import { istToday } from "@/lib/fees/fy";
import { balanceOf, isOverdue } from "@/lib/fees/status";
import { Badge, Card, CardContent, CardHeader, CardTitle, IconTile, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { DeleteClientButton, EditClientButton } from "@/components/clients/client-form";
import { InvoiceRow, ReceiptRow } from "@/components/fees/rows";
import { formatDate, formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/app/clients/${id}`);
  await connection();
  const [data, invoiceRows, receiptRows] = await Promise.all([
    loadClient(user.id, id),
    listInvoices(user.id, { clientId: id }),
    listReceipts(user.id, { clientId: id }),
  ]);
  if (!data) notFound();
  const { client, matters } = data;
  const today = istToday();

  let outstanding = 0;
  let overdue = 0;
  let billed = 0;
  for (const inv of invoiceRows) {
    if (inv.status !== "cancelled" && inv.status !== "draft") billed += inv.totalPaise;
    outstanding += balanceOf(inv);
    if (isOverdue(inv, today)) overdue++;
  }
  const received = receiptRows.reduce((a, r) => a + r.amountPaise, 0);

  return (
    <>
      <Link href="/app/clients" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All clients
      </Link>
      <PageHeader
        eyebrow={client.kind === "business" ? "Business client" : "Client"}
        icon={client.kind === "business" ? Building2 : Contact}
        title={<span data-private>{client.name}</span>}
        actions={
          <>
            <EditClientButton
              client={{
                id: client.id,
                name: client.name,
                kind: client.kind,
                phone: client.phone,
                email: client.email,
                address: client.address,
                gstin: client.gstin,
                notes: client.notes,
              }}
            />
            <DeleteClientButton id={client.id} name={client.name} />
          </>
        }
      />

      <section aria-label="Outstanding balance" className="brand-surface mb-6 overflow-hidden rounded-lg p-5 shadow-brand sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-gold-bright uppercase">Outstanding balance</p>
            <p className="mt-1 font-serif text-4xl font-semibold tracking-tight text-on-brand tabular sm:text-[44px]">{formatINR(outstanding)}</p>
            <p className="mt-1 text-sm text-on-brand-muted">
              {overdue > 0 ? `${overdue} ${overdue === 1 ? "memo is" : "memos are"} past the due date` : outstanding > 0 ? "Nothing overdue" : "All settled"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="gold">
              <Link href={`/app/fees/new?client=${client.id}`}>
                <ReceiptIndianRupee /> New fee memo
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-on-brand/25 bg-on-brand/10 text-on-brand hover:bg-on-brand/15">
              <Link href={`/app/matters/new?client=${client.id}`}>
                <Plus /> New matter
              </Link>
            </Button>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-on-brand/15 pt-4">
          <Stat label="Billed" value={formatINR(billed)} />
          <Stat label="Received" value={formatINR(received)} />
          <Stat label="Matters" value={String(matters.length)} />
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="lg:col-start-2 lg:row-start-1 lg:self-start">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border text-sm">
              <Detail icon={Phone} label="Phone">
                {client.phone ? (
                  <a href={`tel:${client.phone}`} className="text-primary tabular hover:underline">
                    {client.phone}
                  </a>
                ) : null}
              </Detail>
              <Detail icon={Mail} label="Email">
                {client.email ? (
                  <a href={`mailto:${client.email}`} className="break-all text-primary hover:underline">
                    {client.email}
                  </a>
                ) : null}
              </Detail>
              <Detail icon={MapPin} label="Address">
                {client.address ? <span className="whitespace-pre-line">{client.address}</span> : null}
              </Detail>
              {client.kind === "business" ? (
                <Detail icon={ReceiptIndianRupee} label="GSTIN">
                  {client.gstin ? <span className="font-mono tabular">{client.gstin}</span> : null}
                </Detail>
              ) : null}
              <Detail icon={StickyNote} label="Notes">
                {client.notes ? <span className="whitespace-pre-line">{client.notes}</span> : null}
              </Detail>
            </dl>
            <p className="mt-3 text-xs text-muted">Added {formatDate(client.createdAt)}</p>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <ListCard
            title="Matters"
            empty="No matters linked to this client yet."
            action={
              <Link href={`/app/matters/new?client=${client.id}`} className="inline-flex min-h-11 items-center">
                Add matter
              </Link>
            }
          >
            {matters.map((m) => (
              <li key={m.id}>
                <Link href={`/app/matters/${m.id}`} className="group flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
                  <IconTile icon={Briefcase} tone="navy" size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink group-hover:text-primary">{m.title}</p>
                    <p className="truncate text-[13px] text-muted tabular">{[m.court, m.caseNo].filter(Boolean).join(" · ") || `Updated ${formatDate(m.updatedAt)}`}</p>
                  </div>
                  {m.status === "closed" ? <Badge dot>Closed</Badge> : null}
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ListCard>

          <ListCard
            title="Fee memos"
            empty="No fee memos for this client yet."
            action={
              <Link href={`/app/fees/new?client=${client.id}`} className="inline-flex min-h-11 items-center">
                New memo
              </Link>
            }
          >
            {invoiceRows.map((r) => (
              <li key={r.id}>
                <InvoiceRow row={r} today={today} />
              </li>
            ))}
          </ListCard>

          <ListCard title="Receipts" empty="No fees received from this client yet.">
            {receiptRows.map((r) => (
              <li key={r.id}>
                <ReceiptRow row={r} />
              </li>
            ))}
          </ListCard>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-wide text-on-brand-muted uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-base font-semibold text-on-brand tabular sm:text-lg">{value}</dd>
    </div>
  );
}

function Detail({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="mt-0.5 text-ink">{children ?? <span className="text-muted">Not recorded</span>}</dd>
      </div>
    </div>
  );
}

function ListCard({ title, empty, action, children }: { title: string; empty: string; action?: React.ReactNode; children: React.ReactNode[] }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>
        {action ? <div className="text-sm font-semibold text-primary">{action}</div> : null}
      </div>
      <Card>
        {children.length === 0 ? <p className="px-5 py-6 text-sm text-muted">{empty}</p> : <ul className="divide-y divide-border">{children}</ul>}
      </Card>
    </section>
  );
}
