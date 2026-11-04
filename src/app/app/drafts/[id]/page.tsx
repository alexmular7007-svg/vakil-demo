import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { loadDraftBundle } from "@/lib/drafting/queries";
import { features } from "@/lib/env";
import { DraftEditor } from "@/components/drafting/draft-editor";

export const metadata: Metadata = { title: "Draft" };

// AI assist runs as a server action on this page; drafting with the pro model can take a while.
export const maxDuration = 120;

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/app/drafts/${id}`);
  const bundle = await loadDraftBundle(user.id, id, { versions: true, matters: true });
  if (!bundle) notFound();

  return (
    <DraftEditor
      key={bundle.draft.id}
      draft={bundle.draft}
      template={bundle.template}
      versions={bundle.versions}
      matters={bundle.matters}
      aiEnabled={features.ai}
    />
  );
}
