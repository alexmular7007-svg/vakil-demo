import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { documents, matters } from "@/lib/db/schema";
import { isUuid } from "@/lib/drafting/queries";

export { isUuid };

export function fileKind(mime: string): "PDF" | "Word" | "Text" | "File" {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml")) return "Word";
  if (mime.startsWith("text/")) return "Text";
  return "File";
}

/** Characters of extracted text sent to the browser for reading. AI actions use the full text on the server. */
export const DISPLAY_CHARS = 400_000;

export async function loadDocumentView(userId: string, id: string) {
  if (!isUuid(id)) return null;
  return withUser(userId, async (tx) => {
    const [doc] = await tx
      .select({
        id: documents.id,
        name: documents.name,
        mime: documents.mime,
        size: documents.size,
        sha256: documents.sha256,
        pageCount: documents.pageCount,
        status: documents.status,
        error: documents.error,
        textContent: documents.textContent,
        createdAt: documents.createdAt,
        matterTitle: matters.title,
      })
      .from(documents)
      .leftJoin(matters, eq(documents.matterId, matters.id))
      .where(eq(documents.id, id))
      .limit(1);
    if (!doc) return null;
    const others = await tx
      .select({ id: documents.id, name: documents.name, createdAt: documents.createdAt })
      .from(documents)
      .where(and(ne(documents.id, id), eq(documents.status, "ready")))
      .orderBy(desc(documents.createdAt))
      .limit(200);
    return { doc, others };
  });
}
