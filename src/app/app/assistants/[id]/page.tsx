import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { assistants, documents } from "@/lib/db/schema";
import { activePlanId } from "@/lib/ai/gateway";
import { planById } from "@/lib/plans";
import { Card, CardContent, PageHeader } from "@/components/ui/display";
import { AssistantForm } from "@/components/assistants/assistant-form";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/app/assistants/${id}`);
  const [data, plan] = await Promise.all([
    withUser(user.id, async (tx) => {
      const [a] = await tx.select().from(assistants).where(eq(assistants.id, id)).limit(1);
      if (!a) return null;
      const docs = await tx
        .select({ id: documents.id, name: documents.name })
        .from(documents)
        .where(eq(documents.status, "ready"))
        .orderBy(desc(documents.createdAt))
        .limit(100);
      return { a, docs };
    }),
    activePlanId(user.id),
  ]);
  if (!data) notFound();
  return (
    <>
      <Link href="/app/assistants" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> My assistants
      </Link>
      <PageHeader title={data.a.name} description={`Version ${data.a.version}. Changes apply to new messages.`} />
      <Card className="max-w-3xl">
        <CardContent className="pt-5">
          <AssistantForm assistant={data.a} documents={data.docs} allowedTiers={planById[plan].limits.modelTiers} />
        </CardContent>
      </Card>
    </>
  );
}
