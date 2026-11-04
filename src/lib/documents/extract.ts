import "server-only";
import type { SniffedType } from "@/lib/files/validate";
import { normalizeText } from "./chunk";

export type Extraction =
  | { ok: true; text: string; pageCount: number | null }
  | { ok: false; error: string; pageCount: number | null };

/** Fewer letters or digits than this means there is no usable text layer. */
const MIN_TEXT_CHARS = 20;

function hasText(text: string) {
  return (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= MIN_TEXT_CHARS;
}

/**
 * Extracts plain text from an uploaded PDF, DOCX or TXT file that has already
 * been identified by magic bytes. Never throws: failures come back as messages
 * that are safe to show the user.
 */
export async function extractDocumentText(data: Uint8Array, type: SniffedType): Promise<Extraction> {
  try {
    if (type.kind === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      // unpdf may transfer the buffer to its worker, so give it a copy.
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      const joined = normalizeText(text.map((p) => p.trim()).join("\n\n"));
      if (!hasText(joined)) {
        return { ok: false, error: "No text found (scanned image). OCR is not available yet.", pageCount: totalPages };
      }
      return { ok: true, text: joined, pageCount: totalPages };
    }
    if (type.kind === "docx") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
      const text = normalizeText(value);
      if (!hasText(text)) return { ok: false, error: "This Word file has no readable text.", pageCount: null };
      return { ok: true, text, pageCount: null };
    }
    if (type.kind === "text") {
      const text = normalizeText(new TextDecoder("utf-8", { fatal: false }).decode(data).replace(/^﻿/, ""));
      if (!hasText(text)) return { ok: false, error: "This text file is empty.", pageCount: null };
      return { ok: true, text, pageCount: null };
    }
    return { ok: false, error: "Images are not supported yet. OCR is not available yet.", pageCount: null };
  } catch (err) {
    console.error("[documents] extraction failed", type.kind, err);
    const encrypted = err instanceof Error && /password|encrypt/i.test(err.message);
    return {
      ok: false,
      error: encrypted
        ? "This PDF is password-protected. Remove the password and upload it again."
        : "The file could not be read. It may be damaged or in an unsupported format.",
      pageCount: null,
    };
  }
}
