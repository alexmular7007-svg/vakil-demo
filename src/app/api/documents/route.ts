import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { appendAudit } from "@/lib/audit";
import { getCurrentUser, requestIp } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { documentChunks, documents, matters } from "@/lib/db/schema";
import { chunkText } from "@/lib/documents/chunk";
import { extractDocumentText } from "@/lib/documents/extract";
import { isUuid } from "@/lib/documents/queries";
import { deleteFile, putFile } from "@/lib/files/storage";
import { cleanFilename, maxUploadBytes, sniffFile } from "@/lib/files/validate";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";

// Extraction of a large PDF can take several seconds.
export const maxDuration = 60;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Upload a PDF, DOCX or TXT file. The file is identified by its bytes, stored
 * privately, its text extracted and chunked for search. A PDF without a text
 * layer is kept with status "failed" so the user sees why.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Please sign in." }, 401);

  // Same-origin check in addition to SameSite session cookies.
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) {
        return json({ error: "Cross-site upload refused." }, 403);
      }
    } catch {
      return json({ error: "Cross-site upload refused." }, 403);
    }
  }

  try {
    await enforceRateLimit(`documents:upload:${user.id}`, 30, 3600);
  } catch (err) {
    if (err instanceof RateLimitError) return json({ error: "Too many uploads. Please wait a while and try again." }, 429);
    throw err;
  }

  const max = maxUploadBytes();
  const maxMb = Math.round(max / 1024 / 1024);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max + 256 * 1024) return json({ error: `The file is larger than ${maxMb} MB.` }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "The upload could not be read. Please try again." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Choose a file to upload." }, 400);
  if (file.size === 0) return json({ error: "The file is empty." }, 400);
  if (file.size > max) return json({ error: `The file is larger than ${maxMb} MB.` }, 413);
  const matterRaw = form.get("matterId");
  const matterId = typeof matterRaw === "string" && matterRaw ? matterRaw : null;
  if (matterId && !isUuid(matterId)) return json({ error: "That matter was not found." }, 400);

  const data = new Uint8Array(await file.arrayBuffer());
  const type = sniffFile(data, file.name);
  if (!type) return json({ error: "Only PDF, Word (.docx) and plain text (.txt) files are supported." }, 415);
  if (type.kind === "image") {
    return json({ error: "Images are not supported yet because OCR is not available. Upload a PDF with selectable text, a Word file or a text file." }, 415);
  }

  const name = cleanFilename(file.name);
  const extraction = await extractDocumentText(data, type);
  const stored = await putFile(data, { prefix: "documents", ext: type.ext });

  let created: { id: string; chunks: number };
  try {
    created = await withUser(user.id, async (tx) => {
      if (matterId) {
        const [m] = await tx.select({ id: matters.id }).from(matters).where(eq(matters.id, matterId)).limit(1);
        if (!m) throw new Error("matter-not-found");
      }
      const [doc] = await tx
        .insert(documents)
        .values({
          ownerId: user.id,
          matterId,
          name,
          mime: type.mime,
          size: stored.size,
          sha256: stored.sha256,
          storageKey: stored.key,
          pageCount: extraction.pageCount,
          textContent: extraction.ok ? extraction.text : null,
          status: extraction.ok ? "ready" : "failed",
          error: extraction.ok ? null : extraction.error,
        })
        .returning({ id: documents.id });
      const chunks = extraction.ok ? chunkText(extraction.text) : [];
      for (let i = 0; i < chunks.length; i += 200) {
        await tx.insert(documentChunks).values(
          chunks.slice(i, i + 200).map((content, j) => ({ documentId: doc.id, ownerId: user.id, idx: i + j, content })),
        );
      }
      return { id: doc.id, chunks: chunks.length };
    });
  } catch (err) {
    await deleteFile(stored.key).catch(() => {});
    if (err instanceof Error && err.message === "matter-not-found") return json({ error: "That matter was not found." }, 400);
    console.error("[documents] upload failed", err);
    return json({ error: "The upload could not be saved. Please try again." }, 500);
  }

  await appendAudit({
    action: "document.uploaded",
    actorId: user.id,
    actorRole: user.role,
    entityType: "document",
    entityId: created.id,
    ip: await requestIp(),
    data: { sha256: stored.sha256, size: stored.size, mime: type.mime, status: extraction.ok ? "ready" : "failed", chunks: created.chunks },
  });

  return json({
    id: created.id,
    name,
    status: extraction.ok ? "ready" : "failed",
    error: extraction.ok ? null : extraction.error,
    pageCount: extraction.pageCount,
  });
}
