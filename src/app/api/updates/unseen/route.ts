import { getCurrentUser } from "@/lib/auth/dal";
import { unseenHighUpdates } from "@/lib/updates/queries";
import { kindLabel } from "@/lib/updates/labels";
import { ACT_INFO, isActId } from "@/lib/corpus/acts";
import { CORPUS_UPDATED_TAG, type UnseenUpdate } from "@/lib/updates/types";

function researchHref(acts: string[]): string | null {
  const id = acts.find(isActId);
  return id ? `/app/research/${ACT_INFO[id].slug}` : null;
}

/** Up to 3 high-importance updates this user has not seen (empty without feed access). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const rows = await unseenHighUpdates(user, 3);
  const items: UnseenUpdate[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    sourceName: r.sourceName,
    kind: r.kind,
    kindLabel: kindLabel(r.kind),
    url: r.url,
    href: r.kind === "amendment" && r.tags.includes(CORPUS_UPDATED_TAG) ? researchHref(r.acts) : null,
    at: (r.publishedAt ?? r.createdAt).toISOString(),
  }));
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
