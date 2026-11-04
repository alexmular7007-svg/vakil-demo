import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ArrowLeft, FilePen, FileSearch, MessageSquareText } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { chats, documents, drafts, matters } from "@/lib/db/schema";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { EditMatterForm } from "@/components/matters/matter-form";
import { MatterActions } from "@/components/matters/matter-actions";
import { DiaryProvider } from "@/components/diary/diary-provider";
import { MatterHearings } from "@/components/diary/matter-hearings";
import { TasksCard } from "@/components/diary/tasks-card";
import { getMatterDiary } from "@/lib/diary/queries";
import type { MatterOption } from "@/lib/diary/types";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Matter" };

export default async function MatterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/app/matters/${id}`);
  const data = await withUser(user.id, async (tx) => {
    const [matter] = await tx.select().from(matters).where(eq(matters.id, id)).limit(1);
    if (!matter) return null;
    const [c, d, docs] = await Promise.all([
      tx.select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt }).from(chats).where(eq(chats.matterId, id)).orderBy(desc(chats.updatedAt)).limit(20),
      tx.select({ id: drafts.id, title: drafts.title, updatedAt: drafts.updatedAt, status: drafts.status }).from(drafts).where(eq(drafts.matterId, id)).orderBy(desc(drafts.updatedAt)).limit(20),
      tx.select({ id: documents.id, name: documents.name, createdAt: documents.createdAt }).from(documents).where(eq(documents.matterId, id)).orderBy(desc(documents.createdAt)).limit(20),
    ]);
    return { matter, chats: c, drafts: d, docs };
  });
  if (!data) notFound();
  const { matter } = data;
  const code = matter.offenceDate ? (matter.offenceDate < "2024-07-01" ? "IPC / CrPC / Evidence Act" : "BNS / BNSS / BSA") : null;
  const diary = await getMatterDiary(user.id, matter.id);
  const matterOption: MatterOption = {
    id: matter.id,
    title: matter.title,
    court: matter.court,
    caseNo: matter.caseNo,
    cnr: matter.cnr,
    clientName: matter.clientName,
  };

  return (
    <>
      <Link href="/app/matters" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All matters
      </Link>
      <PageHeader
        title={matter.title}
        description={[matter.clientName, matter.court, matter.caseNo].filter(Boolean).join(" · ") || undefined}
        actions={<MatterActions id={matter.id} status={matter.status} />}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {matter.status === "closed" ? <Badge>Closed</Badge> : <Badge tone="success">Open</Badge>}
        {code ? <Badge tone="info">Governing code: {code}</Badge> : null}
      </div>

      <DiaryProvider today={diary.today} defaultDate={diary.today} matters={[matterOption]} fixedMatter={matterOption}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <Button asChild variant="outline" className="h-auto justify-start py-3">
                <Link href={`/app/chat?matter=${matter.id}`}>
                  <MessageSquareText /> Ask AI about this matter
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto justify-start py-3">
                <Link href={`/app/drafts/new?matter=${matter.id}`}>
                  <FilePen /> New draft
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto justify-start py-3">
                <Link href={`/app/documents?matter=${matter.id}`}>
                  <FileSearch /> Add a document
                </Link>
              </Button>
            </div>
            <MatterHearings matter={matterOption} upcoming={diary.upcoming} past={diary.past} />
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <EditMatterForm matter={matter} />
              </CardContent>
            </Card>
          </div>
          <div className="min-w-0 space-y-6">
            <TasksCard tasks={diary.tasks} today={diary.today} fixedMatterId={matter.id} title="Tasks for this matter" />
            <Linked title="Conversations" empty="No conversations linked yet." items={data.chats.map((c) => ({ id: c.id, label: c.title, href: `/app/chat/${c.id}`, meta: formatDate(c.updatedAt) }))} />
            <Linked title="Drafts" empty="No drafts linked yet." items={data.drafts.map((d) => ({ id: d.id, label: d.title, href: `/app/drafts/${d.id}`, meta: d.status === "final" ? "Final" : formatDate(d.updatedAt) }))} />
            <Linked title="Documents" empty="No documents linked yet. Documents in a matter are searched when you ask AI about it." items={data.docs.map((d) => ({ id: d.id, label: d.name, href: `/app/documents/${d.id}`, meta: formatDate(d.createdAt) }))} />
          </div>
        </div>
      </DiaryProvider>
    </>
  );
}

function Linked({ title, items, empty }: { title: string; empty: string; items: { id: string; label: string; href: string; meta: string }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.id}>
                <Link href={i.href} className="flex items-center gap-3 py-2 text-sm hover:text-primary">
                  <span className="min-w-0 flex-1 truncate text-ink">{i.label}</span>
                  <span className="shrink-0 text-xs text-muted">{i.meta}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
