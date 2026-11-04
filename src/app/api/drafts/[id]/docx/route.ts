import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { contentDisposition, draftToDocx } from "@/lib/drafting/docx";
import { loadDraftBundle } from "@/lib/drafting/queries";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";

/** Downloads the last saved version of a draft as a Word document. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await enforceRateLimit(`drafts:export:${user.id}`, 60, 3600);
  } catch (err) {
    if (err instanceof RateLimitError) return Response.json({ error: err.message }, { status: 429 });
    throw err;
  }
  // Row-level security: another user's draft id simply is not found.
  const bundle = await loadDraftBundle(user.id, id);
  if (!bundle) return Response.json({ error: "Draft not found." }, { status: 404 });

  const buf = await draftToDocx(bundle.draft.body, { title: bundle.draft.title, language: bundle.draft.language });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": contentDisposition(bundle.draft.title, "docx"),
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
