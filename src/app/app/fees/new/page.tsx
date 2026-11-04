import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ArrowLeft, ReceiptIndianRupee } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { clients, matters } from "@/lib/db/schema";
import { getBillingProfile } from "@/lib/fees/queries";
import { addDays, financialYearOf, istToday } from "@/lib/fees/fy";
import { PageHeader } from "@/components/ui/display";
import { InvoiceBuilder } from "@/components/fees/invoice-builder";

export const metadata: Metadata = { title: "New fee memo" };

const uuid = (v: unknown) => (typeof v === "string" && z.uuid().safeParse(v).success ? v : undefined);

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/fees/new");
  await connection();
  const sp = await searchParams;
  const [profile, data] = await Promise.all([
    getBillingProfile(user.id, user.name),
    withUser(user.id, async (tx) => {
      const [clientRows, matterRows] = await Promise.all([
        tx
          .select({ id: clients.id, name: clients.name, kind: clients.kind, address: clients.address, gstin: clients.gstin, email: clients.email })
          .from(clients)
          .where(eq(clients.ownerId, user.id))
          .orderBy(asc(clients.name))
          .limit(2000),
        tx
          .select({ id: matters.id, title: matters.title, clientId: matters.clientId, status: matters.status })
          .from(matters)
          .where(eq(matters.ownerId, user.id))
          .orderBy(sql`${matters.status} = 'closed'`, desc(matters.updatedAt))
          .limit(500),
      ]);
      return { clientRows, matterRows };
    }),
  ]);

  // ?matter=<id> also selects that matter's client; ?client=<id> wins when both are given.
  const matter = data.matterRows.find((m) => m.id === uuid(sp.matter));
  const clientParam = uuid(sp.client);
  const clientId = data.clientRows.some((c) => c.id === clientParam) ? clientParam : (matter?.clientId ?? undefined);
  const today = istToday();

  return (
    <>
      <Link href="/app/fees" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Fee book
      </Link>
      <PageHeader
        eyebrow="Fee book"
        icon={ReceiptIndianRupee}
        title="New fee memo"
        description="A professional fee memo with your letterhead, amount in words and a Pay by UPI code."
      />
      <InvoiceBuilder
        clients={data.clientRows}
        matters={data.matterRows}
        profile={{ gstin: profile.gstin, upiId: profile.upiId, invoicePrefix: profile.invoicePrefix, fyLabel: financialYearOf(today).label }}
        defaults={{ clientId, matterId: matter?.id, issueDate: today, dueDate: addDays(today, 15) }}
      />
    </>
  );
}
