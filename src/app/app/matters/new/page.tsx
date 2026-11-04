import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Briefcase } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { listClientOptions } from "@/lib/clients/queries";
import { Card, CardContent, PageHeader } from "@/components/ui/display";
import { NewMatterForm } from "@/components/matters/matter-form";

export const metadata: Metadata = { title: "New matter" };

export default async function NewMatterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/matters/new");
  const sp = await searchParams;
  const clients = await listClientOptions(user.id);
  const wanted = typeof sp.client === "string" && z.uuid().safeParse(sp.client).success ? sp.client : undefined;
  const defaultClientId = wanted && clients.some((c) => c.id === wanted) ? wanted : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/matters" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All matters
      </Link>
      <PageHeader
        eyebrow="Practice"
        icon={Briefcase}
        title="New matter"
        description="Group conversations, drafts, documents, hearings and fee memos for one case. The offence date decides IPC or BNS automatically."
      />
      <Card>
        <CardContent className="pt-5">
          <NewMatterForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} defaultClientId={defaultClientId} />
        </CardContent>
      </Card>
    </div>
  );
}
