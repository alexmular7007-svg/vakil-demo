import type { Metadata } from "next";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { getTemplate, templateCatalog } from "@/lib/drafting/catalog";
import { listMatterOptions, templateReviewMap } from "@/lib/drafting/queries";
import { toTemplateSummary } from "@/lib/drafting/types";
import { PageHeader } from "@/components/ui/display";
import { NewDraftFlow } from "@/components/drafting/new-draft-flow";

export const metadata: Metadata = { title: "New draft" };

export default async function NewDraftPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/drafts/new");
  const sp = await searchParams;
  const requested = typeof sp.template === "string" ? sp.template : null;
  const initialSlug = getTemplate(requested)?.slug ?? null;

  const { matters, reviews } = await withUser(user.id, async (tx) => ({
    matters: await listMatterOptions(tx),
    reviews: await templateReviewMap(tx),
  }));
  const summaries = templateCatalog.map((t) => toTemplateSummary(t, reviews.has(t.slug) ? reviews.get(t.slug) : t.reviewedBy));

  await connection();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <div>
      <PageHeader
        title="New draft"
        description="Pick a template and answer a few questions, or start with a blank page. You can edit every word afterwards."
      />
      {requested && !initialSlug ? (
        <p className="mb-4 text-sm text-muted">That template was not found, so the full gallery is shown.</p>
      ) : null}
      <NewDraftFlow
        templates={summaries}
        initialSlug={initialSlug}
        matters={matters}
        today={today}
        defaultLanguage={user.locale === "hi" ? "hi" : "en"}
      />
    </div>
  );
}
