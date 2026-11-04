// Draft markup: a small, predictable format for Indian court documents that the
// editor preview, the print view and the DOCX export all render the same way.
//
//   # TEXT        centred bold title (court name, document title)
//   ## TEXT       centred bold heading (VERSUS, PRAYER, VERIFICATION)
//   ### TEXT      bold side heading
//   ^^ TEXT       centred plain line (e.g. "...Applicant")
//   >> TEXT       right-aligned line (signature blocks, "Through Counsel")
//   ---           blank separator line
//   ===           page break
//   **bold**      bold words inside any line
//   {{name}}      a placeholder still to be filled (highlighted)
// A blank line separates paragraphs; a single line break is kept as a break.

import { PLACEHOLDER_RE } from "./fill";

export type Inline = { text: string; bold?: boolean; placeholder?: string };
export type Line = Inline[];

export type Block =
  | { kind: "title" | "heading" | "subheading"; lines: Line[] }
  | { kind: "center" | "right" | "para"; lines: Line[] }
  | { kind: "separator" }
  | { kind: "pagebreak" };

type LineKind = "title" | "heading" | "subheading" | "center" | "right" | "para" | "separator" | "pagebreak" | "blank";

function classify(raw: string): { kind: LineKind; text: string } {
  const line = raw.replace(/\s+$/, "");
  const t = line.trim();
  if (t === "") return { kind: "blank", text: "" };
  if (t === "---") return { kind: "separator", text: "" };
  if (t === "===") return { kind: "pagebreak", text: "" };
  if (t.startsWith("### ")) return { kind: "subheading", text: t.slice(4) };
  if (t.startsWith("## ")) return { kind: "heading", text: t.slice(3) };
  if (t.startsWith("# ")) return { kind: "title", text: t.slice(2) };
  if (t.startsWith("^^")) return { kind: "center", text: t.slice(2).trim() };
  if (t.startsWith(">>")) return { kind: "right", text: t.slice(2).trim() };
  return { kind: "para", text: line };
}

/** Split one line into bold / placeholder / plain runs. */
export function parseInline(text: string): Line {
  const out: Inline[] = [];
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of boldParts) {
    if (!part) continue;
    const bold = part.startsWith("**") && part.endsWith("**") && part.length > 4;
    const inner = bold ? part.slice(2, -2) : part;
    let last = 0;
    for (const m of inner.matchAll(new RegExp(PLACEHOLDER_RE.source, "g"))) {
      const idx = m.index ?? 0;
      if (idx > last) out.push({ text: inner.slice(last, idx), ...(bold ? { bold } : {}) });
      out.push({ text: m[0], placeholder: m[1], ...(bold ? { bold } : {}) });
      last = idx + m[0].length;
    }
    if (last < inner.length) out.push({ text: inner.slice(last), ...(bold ? { bold } : {}) });
  }
  return out;
}

/** Parse a draft body into render-ready blocks. */
export function parseDraft(body: string): Block[] {
  const blocks: Block[] = [];
  let current: { kind: "title" | "heading" | "subheading" | "center" | "right" | "para"; lines: Line[] } | null = null;
  const flush = () => {
    if (current && current.lines.length) blocks.push(current);
    current = null;
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const { kind, text } = classify(raw);
    if (kind === "blank") {
      flush();
      continue;
    }
    if (kind === "separator" || kind === "pagebreak") {
      flush();
      blocks.push({ kind });
      continue;
    }
    // Headings are always their own block; centred/right/para lines group with
    // neighbours of the same kind so addresses and signature blocks stay together.
    const groupable = kind === "center" || kind === "right" || kind === "para";
    if (!current || current.kind !== kind || !groupable) {
      flush();
      current = { kind, lines: [] };
    }
    current.lines.push(parseInline(text));
  }
  flush();
  return blocks;
}

/**
 * Address and cause-title blocks (several short lines) read better left-aligned;
 * ordinary paragraphs are justified.
 */
export function isShortLineBlock(lines: Line[]): boolean {
  return lines.length > 1 && lines.every((l) => l.reduce((n, r) => n + r.text.length, 0) <= 90);
}

/** Plain text without markup, for copying or word counts. */
export function stripMarkup(body: string): string {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => {
      const t = l.trim();
      if (t === "---" || t === "===") return "";
      return l.replace(/^\s*(#{1,3} |\^\^\s?|>>\s?)/, "").replace(/\*\*([^*]+)\*\*/g, "$1");
    })
    .join("\n");
}

export function wordCount(body: string): number {
  const t = stripMarkup(body).trim();
  return t ? t.split(/\s+/).length : 0;
}
