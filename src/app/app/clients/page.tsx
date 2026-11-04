import type { Metadata } from "next";
import { Contact, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listClients } from "@/lib/clients/queries";
import { Card, CardContent, EmptyState, IconTile, PageHeader } from "@/components/ui/display";
import { NewClientButton } from "@/components/clients/client-form";
import { ClientDirectory } from "@/components/clients/client-directory";
import { ConflictCheck } from "@/components/clients/conflict-check";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const user = await requireUser("/app/clients");
  const rows = await listClients(user.id);

  return (
    <>
      <PageHeader
        eyebrow="Practice"
        icon={Contact}
        title="Clients"
        description="Your client register: contact details, linked matters and what each client owes."
        actions={<NewClientButton />}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={Contact}
              title="No clients yet"
              description="Add a client to link their matters, bill them from the fee book and run conflict checks."
              action={<NewClientButton />}
            />
          ) : (
            <ClientDirectory rows={rows} />
          )}
        </div>
        <div className="space-y-6">
          <ConflictCheck />
          <DpdpNotice />
        </div>
      </div>
    </>
  );
}

function DpdpNotice() {
  return (
    <Card>
      <CardContent className="flex gap-3 pt-5">
        <IconTile icon={ShieldCheck} tone="green" size="sm" />
        <div className="space-y-1.5 text-sm">
          <p className="font-semibold text-ink">Client data is your practice&apos;s data</p>
          <p className="text-muted">
            Under the Digital Personal Data Protection Act, 2023 your practice decides why client details are kept. Record only what you need to act
            for and bill the client, keep it accurate, and delete it when it is no longer needed. It stays in your private workspace; other users
            cannot see it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
