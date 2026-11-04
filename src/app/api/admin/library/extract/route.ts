import type { NextRequest } from "next/server";
import { adminForAction, NOT_ADMIN } from "@/lib/admin/guard";
import { extractDocumentText } from "@/lib/documents/extract";
import { maxUploadBytes, sniffFile } from "@/lib/files/validate";
import { json, sameOrigin } from "@/lib/judgments/http";
import { guessJudgmentMeta } from "@/lib/judgments/text";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";

// Extraction of a long judgment PDF can take several seconds.
export const maxDuration = 60;

/**
 * Admin "Add judgment": reads the text of an uploaded PDF, DOCX or TXT file and
 * guesses metadata from its first page, for the admin to review. Nothing is
 * stored here; the reviewed text is saved by POST /api/admin/library/judgments.
 */
export async function POST(req: NextRequest) {
  const admin = await adminForAction();
  if (!admin) return json({ error: NOT_ADMIN }, 403);
  if (!sameOrigin(req)) return json({ error: "Cross-site upload refused." }, 403);
  try {
    await enforceRateLimit(`library:extract:${admin.id}`, 60, 3600);
  } catch (err) {
    if (err instanceof RateLimitError) return json({ error: err.message }, 429);
    throw err;
  }

  const max = maxUploadBytes();
  const maxMb = Math.round(max / 1024 / 1024);
  if (Number(req.headers.get("content-length") ?? "0") > max + 256 * 1024) return json({ error: `The file is larger than ${maxMb} MB.` }, 413);

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

  const data = new Uint8Array(await file.arrayBuffer());
  const type = sniffFile(data, file.name);
  if (!type) return json({ error: "Only PDF, Word (.docx) and plain text (.txt) files are supported." }, 415);
  if (type.kind === "image") return json({ error: "Images are not supported because OCR is not available. Upload a PDF with selectable text." }, 415);

  const extraction = await extractDocumentText(data, type);
  if (!extraction.ok) return json({ error: extraction.error }, 422);
  return json({ text: extraction.text, pageCount: extraction.pageCount, meta: guessJudgmentMeta(extraction.text) });
}
