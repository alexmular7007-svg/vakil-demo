import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { contentDisposition } from "@/lib/drafting/docx";
import { isUuid } from "@/lib/documents/queries";
import { getFile } from "@/lib/files/storage";

/** Downloads the original uploaded file. Row-level security limits it to the owner. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Document not found." }, { status: 404 });

  const [doc] = await withUser(user.id, (tx) =>
    tx.select({ name: documents.name, mime: documents.mime, storageKey: documents.storageKey }).from(documents).where(eq(documents.id, id)).limit(1),
  );
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });

  let data: Buffer;
  try {
    data = await getFile(doc.storageKey);
  } catch {
    return Response.json({ error: "The stored file is missing." }, { status: 410 });
  }
  const base = doc.name.replace(/\.[a-z0-9]{1,5}$/i, "");
  const ext = doc.name.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase() ?? "bin";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": contentDisposition(base, ext),
      "Content-Length": String(data.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
