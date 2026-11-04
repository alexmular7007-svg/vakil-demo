import type { Metadata } from "next";
import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { Briefcase, CalendarDays, Landmark } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { chats, documents, drafts, matters } from "@/lib/db/schema";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { NewMatterButton } from "@/components/matters/matter-form";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Matters" };

export default async function MattersPage() {
  const user = await requireUser("/app/matters");
  const rows = await withUser(user.id, (tx) =>
    tx
      .select({
        id: matters.id,
        title: matters.title,
        clientName: matters.clientName,
        court: matters.court,
        status: matters.status,
        offenceDate: matters.offenceDate,
        updatedAt: matters.updatedAt,
        // The outer column is written out: drizzle leaves single-table selects unqualified,
        // and a bare "id" inside the subquery would bind to the inner table.
        chats: sql<number>`(select count(*)::int from ${chats} where ${chats.matterId} = "matters"."id")`,
        drafts: sql<number>`(select count(*)::int from ${drafts} where ${drafts.matterId} = "matters"."id")`,
        docs: sql<number>`(select count(*)::int from ${documents} where ${documents.matterId} = "matters"."id")`,
      })
      .from(matters)
      .orderBy(sql`${matters.status} = 'closed'`, desc(matters.updatedAt)),
  );

  return (
    <>
      <PageHeader
        title="Matters"
        description="Keep each case's conversations, drafts and documents together. The offence date decides IPC or BNS automatically."
        actions={<NewMatterButton />}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Briefcase} title="No matters yet" description="Create a matter to group your work on one case." action={<NewMatterButton />} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((m) => (
            <Link key={m.id} href={`/app/matters/${m.id}`} className="group rounded-lg border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium text-ink group-hover:text-primary">{m.title}</h2>
                {m.status === "closed" ? <Badge>Closed</Badge> : null}
              </div>
              {m.clientName ? <p className="mt-0.5 text-sm text-muted">{m.clientName}</p> : null}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                {m.court ? (
                  <span className="inline-flex items-center gap-1">
                    <Landmark className="size-3.5" /> {m.court}
                  </span>
                ) : null}
                {m.offenceDate ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" /> {formatDate(m.offenceDate)} · {m.offenceDate < "2024-07-01" ? "IPC" : "BNS"}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 border-t border-border pt-2 text-xs text-muted">
                {m.chats} conversations · {m.drafts} drafts · {m.docs} documents · updated {formatDate(m.updatedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
