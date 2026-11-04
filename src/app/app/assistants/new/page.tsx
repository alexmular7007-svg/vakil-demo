import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { activePlanId } from "@/lib/ai/gateway";
import { planById } from "@/lib/plans";
import { Card, CardContent, PageHeader } from "@/components/ui/display";
import { AssistantForm } from "@/components/assistants/assistant-form";

export const metadata: Metadata = { title: "New assistant" };

export default async function NewAssistantPage() {
  const user = await requireUser("/app/assistants/new");
  const [docs, plan] = await Promise.all([
    withUser(user.id, (tx) =>
      tx.select({ id: documents.id, name: documents.name }).from(documents).where(eq(documents.status, "ready")).orderBy(desc(documents.createdAt)).limit(100),
    ),
    activePlanId(user.id),
  ]);
  return (
    <>
      <Link href="/app/assistants" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> My assistants
      </Link>
      <PageHeader title="New assistant" description="Give it standing instructions once; use it in Ask AI whenever you need it." />
      <Card className="max-w-3xl">
        <CardContent className="pt-5">
          <AssistantForm documents={docs} allowedTiers={planById[plan].limits.modelTiers} />
        </CardContent>
      </Card>
    </>
  );
}
