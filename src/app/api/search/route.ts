import type { NextRequest } from "next/server";
import { desc, ilike, or } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { chats, documents, drafts, matters } from "@/lib/db/schema";
import { ACT_INFO, isActId } from "@/lib/corpus/acts";
import { searchStatutes } from "@/lib/corpus/search";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export type SearchHit = { group: string; title: string; detail: string; href: string };

const PER_GROUP = 5;

/** Workspace search for the Ctrl K palette: the user's own records (RLS) plus bare acts. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return Response.json({ hits: [] });

  try {
    await enforceRateLimit(`search:${user.id}`, 120, 60);
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: e.message }, { status: 429 });
    throw e;
  }

  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const [own, statutes] = await Promise.all([
    withUser(user.id, async (tx) => {
      const [m, d, docs, c] = await Promise.all([
        tx
          .select({ id: matters.id, title: matters.title, clientName: matters.clientName, caseNo: matters.caseNo })
          .from(matters)
          .where(or(ilike(matters.title, like), ilike(matters.clientName, like), ilike(matters.caseNo, like)))
          .orderBy(desc(matters.updatedAt))
          .limit(PER_GROUP),
        tx.select({ id: drafts.id, title: drafts.title, status: drafts.status }).from(drafts).where(ilike(drafts.title, like)).orderBy(desc(drafts.updatedAt)).limit(PER_GROUP),
        tx.select({ id: documents.id, name: documents.name }).from(documents).where(ilike(documents.name, like)).orderBy(desc(documents.createdAt)).limit(PER_GROUP),
        tx.select({ id: chats.id, title: chats.title }).from(chats).where(ilike(chats.title, like)).orderBy(desc(chats.updatedAt)).limit(PER_GROUP),
      ]);
      return [
        ...m.map((r) => ({ group: "Matters", title: r.title, detail: [r.clientName, r.caseNo].filter(Boolean).join(" · ") || "Matter", href: `/app/matters/${r.id}` })),
        ...d.map((r) => ({ group: "Drafts", title: r.title, detail: r.status === "final" ? "Final draft" : "Draft", href: `/app/drafts/${r.id}` })),
        ...docs.map((r) => ({ group: "Documents", title: r.name, detail: "Document", href: `/app/documents/${r.id}` })),
        ...c.map((r) => ({ group: "Conversations", title: r.title, detail: "Ask AI", href: `/app/chat/${r.id}` })),
      ];
    }),
    searchStatutes(q, { limit: PER_GROUP }).catch(() => []),
  ]);

  const hits: SearchHit[] = [
    ...own,
    ...statutes.map((s) => ({
      group: "Bare acts",
      title: `${s.actId} s. ${s.sectionNo}${s.heading ? ` · ${s.heading}` : ""}`,
      detail: s.actTitle,
      href: isActId(s.actId) ? `/app/research/${ACT_INFO[s.actId].slug}/${s.sectionNo}` : `/app/research?q=${encodeURIComponent(q)}`,
    })),
  ];
  return Response.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}
