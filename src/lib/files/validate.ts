import "server-only";
import { env } from "@/lib/env";

export type SniffedType = { mime: string; ext: string; kind: "pdf" | "docx" | "image" | "text" };

/**
 * Identify a file by its first bytes (magic numbers), never by the name or the
 * browser-supplied MIME type, which an attacker controls.
 */
export function sniffFile(buf: Uint8Array, filename: string): SniffedType | null {
  const b = buf;
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: "application/pdf", ext: "pdf", kind: "pdf" };
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { mime: "image/png", ext: "png", kind: "image" };
  if (starts(0xff, 0xd8, 0xff)) return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  // DOCX is a ZIP container; require the .docx name and a word/ entry marker.
  if (starts(0x50, 0x4b, 0x03, 0x04) && /\.docx$/i.test(filename)) {
    const head = Buffer.from(b.subarray(0, Math.min(b.length, 64 * 1024))).toString("latin1");
    if (head.includes("word/") || head.includes("[Content_Types].xml")) {
      return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx", kind: "docx" };
    }
  }
  if (/\.(txt|md)$/i.test(filename) && isProbablyText(b)) return { mime: "text/plain", ext: "txt", kind: "text" };
  return null;
}

function isProbablyText(b: Uint8Array) {
  const n = Math.min(b.length, 4096);
  for (let i = 0; i < n; i++) if (b[i] === 0) return false;
  return true;
}

export const maxUploadBytes = () => env.MAX_UPLOAD_MB * 1024 * 1024;

export function cleanFilename(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").slice(0, 160) || "document";
}
