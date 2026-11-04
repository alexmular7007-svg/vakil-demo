// Splits extracted document text into overlapping chunks for keyword retrieval.
// Pure function, safe for tests.

export type ChunkOptions = { size?: number; overlap?: number };

/** Normalises whitespace from PDF/DOCX extraction without losing paragraph breaks. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Chunks of about `size` characters that end at a paragraph, sentence or word
 * boundary where possible, each overlapping the previous one by about `overlap`
 * characters so a clause split across a boundary is still found whole.
 */
export function chunkText(text: string, { size = 1200, overlap = 200 }: ChunkOptions = {}): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= size) return [t];
  const chunks: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + size, t.length);
    if (end < t.length) {
      const windowStart = start + Math.floor(size * 0.6);
      const slice = t.slice(windowStart, end);
      const breaks = ["\n\n", ". ", "।", "\n", "; ", " "];
      for (const b of breaks) {
        const idx = slice.lastIndexOf(b);
        if (idx >= 0) {
          end = windowStart + idx + b.length;
          break;
        }
      }
    }
    const chunk = t.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= t.length) break;
    // Step back by the overlap, then forward to the next word boundary.
    let next = Math.max(end - overlap, start + 1);
    const space = t.indexOf(" ", next);
    if (space !== -1 && space < end) next = space + 1;
    start = next;
  }
  return chunks;
}
