import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { LEGAL_FRAMING } from "./constants";

// pdf-lib's standard fonts use WinAnsi encoding: Latin-1 plus a few typographic
// characters. They cannot shape Devanagari or other Indic scripts.
const WIN_ANSI_EXTRAS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""),
);

function encodable(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRAS.has(ch);
}

const REPLACEMENTS: Record<string, string> = {
  "₹": "Rs. ",
  "­": "",
  "​": "",
  "‌": "",
  "‍": "",
  "﻿": "",
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "−": "-",
  "′": "'",
  "″": '"',
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
};

function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .split("")
    .map((ch) => REPLACEMENTS[ch] ?? ch)
    .join("");
}

/** True when the text has characters the standard PDF fonts cannot draw (e.g. Hindi). */
export function hasUnsupportedChars(text: string): boolean {
  for (const ch of normalise(text)) {
    if (ch === "\n") continue;
    if (!encodable(ch)) return true;
  }
  return false;
}

/** Text safe for standard fonts: unsupported characters become "?". */
export function pdfSafe(text: string): string {
  let out = "";
  for (const ch of normalise(text)) out += ch === "\n" || encodable(ch) ? ch : "?";
  return out;
}

export class UnsupportedTextError extends Error {
  constructor() {
    super(
      "This draft contains Hindi or other non-Latin text. Standard PDF fonts cannot shape Devanagari, so export the draft as a PDF from the drafting editor and upload that file instead.",
    );
    this.name = "UnsupportedTextError";
  }
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const INK = rgb(0.055, 0.09, 0.15);
const MUTED = rgb(0.36, 0.39, 0.45);
const RULE = rgb(0.82, 0.82, 0.78);
const ACCENT = rgb(0.043, 0.43, 0.31);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }
    const words = para.split(/(\s+)/).filter((w) => w.length > 0);
    let line = "";
    for (const w of words) {
      const candidate = line + w;
      if (font.widthOfTextAtSize(candidate.trimEnd(), size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      // Hard-break words longer than a line (hashes, URLs).
      let word = w.trimStart();
      while (font.widthOfTextAtSize(word, size) > maxWidth) {
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      line = word;
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
}

/** Simple flowing-text writer that adds A4 pages as needed. */
class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private onNewPage?: (w: Writer) => void,
  ) {}
  get width() {
    return A4[0] - MARGIN * 2;
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
    this.onNewPage?.(this);
  }
  ensure(height: number) {
    if (!this.page || this.y - height < MARGIN + 24) this.newPage();
  }
  text(text: string, opts: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; gap?: number; indent?: number; lineHeight?: number }) {
    const indent = opts.indent ?? 0;
    const lh = opts.lineHeight ?? opts.size * 1.42;
    for (const line of wrap(pdfSafe(text), opts.font, opts.size, this.width - indent)) {
      this.ensure(lh);
      if (line) {
        this.page.drawText(line, { x: MARGIN + indent, y: this.y - opts.size, size: opts.size, font: opts.font, color: opts.color ?? INK });
      }
      this.y -= lh;
    }
    this.y -= opts.gap ?? 0;
  }
  rule(gap = 10) {
    this.ensure(gap * 2);
    this.y -= gap;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4[0] - MARGIN, y: this.y }, thickness: 0.6, color: RULE });
    this.y -= gap;
  }
  space(h: number) {
    this.y -= h;
  }
}

function stampPageNumbers(doc: PDFDocument, font: PDFFont, from: number, label: string) {
  const pages = doc.getPages().slice(from);
  pages.forEach((p, i) => {
    const text = pdfSafe(`${label} · page ${i + 1} of ${pages.length}`);
    const size = 8;
    const w = font.widthOfTextAtSize(text, size);
    p.drawText(text, { x: (A4[0] - w) / 2, y: MARGIN / 2, size, font, color: MUTED });
  });
}

/** Strip light Markdown so a draft reads as plain legal text. */
function markdownToBlocks(body: string): { kind: "heading" | "para"; text: string }[] {
  const blocks: { kind: "heading" | "para"; text: string }[] = [];
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1");
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: "heading", text: h[1].trim() });
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    blocks.push({ kind: "para", text: bullet ? `•  ${bullet[1]}` : line });
  }
  return blocks;
}

/** Render an English draft as a paginated A4 PDF with standard fonts. */
export async function renderTextPdf(input: { title: string; body: string }): Promise<Uint8Array> {
  if (hasUnsupportedChars(input.title) || hasUnsupportedChars(input.body)) throw new UnsupportedTextError();
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(input.title));
  doc.setProducer("Vaakil AI");
  doc.setCreator("Vaakil AI drafting");
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const w = new Writer(doc);
  w.newPage();
  // Centered title
  const titleLines = wrap(pdfSafe(input.title), bold, 15, w.width);
  for (const line of titleLines) {
    const tw = bold.widthOfTextAtSize(line, 15);
    w.ensure(22);
    w.page.drawText(line, { x: (A4[0] - tw) / 2, y: w.y - 15, size: 15, font: bold, color: INK });
    w.y -= 22;
  }
  w.space(10);
  for (const block of markdownToBlocks(input.body)) {
    if (block.kind === "heading") {
      w.space(4);
      w.text(block.text, { font: bold, size: 12, gap: 2 });
    } else if (block.text.trim() === "") {
      w.space(7);
    } else {
      w.text(block.text, { font: regular, size: 11.5, lineHeight: 16.5 });
    }
  }
  stampPageNumbers(doc, sans, 0, pdfSafe(input.title).slice(0, 80));
  return doc.save();
}

export class UnreadablePdfError extends Error {
  constructor(message = "This PDF could not be read. It may be password-protected or damaged. Remove the password (or re-export it) and upload it again.") {
    super(message);
    this.name = "UnreadablePdfError";
  }
}

/** Check an uploaded PDF can be opened and extended later (not encrypted, has pages). */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number }> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const pageCount = doc.getPageCount();
    if (pageCount < 1) throw new UnreadablePdfError("This PDF has no pages.");
    return { pageCount };
  } catch (err) {
    if (err instanceof UnreadablePdfError) throw err;
    throw new UnreadablePdfError();
  }
}

export type CertificateRecipient = {
  roleLabel: string;
  actionLabel: string;
  routingOrder: number;
  name: string;
  maskedEmail: string;
  authMethod: string;
  outcome: string;
  actedAtIst: string;
  ip: string;
  userAgent: string;
  consentVersion: string | null;
  signatureKind: "typed" | "drawn" | null;
  signatureText: string | null;
  /** Decoded PNG bytes of a drawn signature. */
  signaturePng: Uint8Array | null;
  signatureSha256: string | null;
};

export type CertificateData = {
  envelopeId: string;
  title: string;
  category: string;
  ownerName: string;
  createdAtIst: string;
  sentAtIst: string;
  completedAtIst: string;
  originalSha256: string;
  lockedSha256: string;
  chainHeadHash: string;
  chainEventCount: number;
  verifyUrl: string;
  recipients: CertificateRecipient[];
};

/**
 * Final PDF = the original pages, unchanged, followed by appended "Signature page
 * and certificate of completion" pages. The final SHA-256 is computed by the caller
 * over the returned bytes (a file cannot contain its own hash).
 */
export async function buildFinalPdf(original: Uint8Array, cert: CertificateData): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const firstCertPage = doc.getPageCount();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const qrPng = await QRCode.toBuffer(cert.verifyUrl, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 300 });
  const qr = await doc.embedPng(qrPng);

  const w = new Writer(doc, (wr) => {
    wr.page.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: ACCENT });
  });
  w.newPage();

  // Heading + QR
  const qrSize = 92;
  w.page.drawImage(qr, { x: A4[0] - MARGIN - qrSize, y: w.y - qrSize, width: qrSize, height: qrSize });
  const headingWidth = w.width - qrSize - 16;
  for (const line of wrap("Signature page and certificate of completion", bold, 16, headingWidth)) {
    w.page.drawText(line, { x: MARGIN, y: w.y - 16, size: 16, font: bold, color: INK });
    w.y -= 21;
  }
  for (const line of wrap(pdfSafe(cert.title), regular, 11, headingWidth)) {
    w.page.drawText(line, { x: MARGIN, y: w.y - 11, size: 11, font: regular, color: INK });
    w.y -= 15;
  }
  for (const line of wrap(`Verify this envelope: ${cert.verifyUrl}`, regular, 8, headingWidth)) {
    w.page.drawText(pdfSafe(line), { x: MARGIN, y: w.y - 8, size: 8, font: regular, color: MUTED });
    w.y -= 11;
  }
  w.y = Math.min(w.y, A4[1] - MARGIN - qrSize - 6);
  w.space(6);

  // Legal framing
  w.text("Type of signature", { font: bold, size: 9.5, color: ACCENT, gap: 2 });
  w.text(LEGAL_FRAMING, { font: regular, size: 9, lineHeight: 12.5, gap: 2 });
  w.rule(8);

  // Envelope details
  const kv = (k: string, v: string, font: PDFFont = regular) => {
    w.text(k, { font: bold, size: 8.5, color: MUTED });
    w.text(v, { font, size: font === mono ? 8 : 9.5, lineHeight: font === mono ? 11 : 13, gap: 3 });
  };
  w.text("Envelope", { font: bold, size: 9.5, color: ACCENT, gap: 4 });
  kv("Envelope ID", cert.envelopeId, mono);
  kv("Document category", cert.category);
  kv("Sent by", cert.ownerName);
  kv("Created / sent / completed", `${cert.createdAtIst}  /  ${cert.sentAtIst}  /  ${cert.completedAtIst}`);
  kv("Original document SHA-256 (at upload)", cert.originalSha256, mono);
  kv("Locked document SHA-256 (the exact file every party approved or signed)", cert.lockedSha256, mono);
  kv(
    "Audit chain head (SHA-256 of the latest event before completion)",
    `${cert.chainHeadHash}  (${cert.chainEventCount} events)`,
    mono,
  );
  w.rule(8);

  // Recipients
  w.text("Parties and actions", { font: bold, size: 9.5, color: ACCENT, gap: 4 });
  for (const r of cert.recipients) {
    w.ensure(120);
    w.text(`${r.roleLabel} · ${r.actionLabel} · routing order ${r.routingOrder}`, { font: bold, size: 10, gap: 1 });
    const details = [
      `Name: ${r.name}`,
      `Email: ${r.maskedEmail}`,
      `Authentication: ${r.authMethod}`,
      `Outcome: ${r.outcome}${r.actedAtIst ? ` at ${r.actedAtIst}` : ""}`,
      `IP address: ${r.ip || "—"}`,
      `Browser: ${r.userAgent || "—"}`,
      ...(r.consentVersion ? [`Consent text version: ${r.consentVersion}`] : []),
    ];
    for (const d of details) w.text(d, { font: regular, size: 8.5, lineHeight: 11.5, indent: 10 });
    if (hasUnsupportedChars(r.name)) {
      w.text("(The name contains characters that standard PDF fonts cannot draw; the exact Unicode text is kept in the audit trail.)", {
        font: regular,
        size: 7.5,
        color: MUTED,
        indent: 10,
      });
    }
    if (r.signatureKind) {
      w.space(3);
      w.text(r.signatureKind === "typed" ? "Typed signature:" : "Drawn signature:", { font: bold, size: 8.5, indent: 10, gap: 2 });
      let drewImage = false;
      if (r.signatureKind === "drawn" && r.signaturePng) {
        let img: PDFImage | null = null;
        try {
          img = await doc.embedPng(r.signaturePng);
        } catch {
          img = null;
        }
        if (img) {
          const maxW = 200;
          const maxH = 64;
          const scale = Math.min(maxW / img.width, maxH / img.height, 1);
          const iw = img.width * scale;
          const ih = img.height * scale;
          w.ensure(ih + 10);
          w.page.drawRectangle({
            x: MARGIN + 10,
            y: w.y - ih - 6,
            width: Math.max(iw, 120) + 12,
            height: ih + 8,
            borderColor: RULE,
            borderWidth: 0.6,
          });
          w.page.drawImage(img, { x: MARGIN + 16, y: w.y - ih - 2, width: iw, height: ih });
          w.y -= ih + 12;
          drewImage = true;
        }
      }
      if (r.signatureKind === "typed" && r.signatureText) {
        w.text(r.signatureText, { font: italic, size: 18, indent: 16, lineHeight: 24 });
        if (hasUnsupportedChars(r.signatureText)) {
          w.text("(The typed signature contains characters that standard PDF fonts cannot draw; the exact Unicode text and its SHA-256 are kept in the audit trail.)", {
            font: regular,
            size: 7.5,
            color: MUTED,
            indent: 10,
          });
        }
      } else if (r.signatureKind === "drawn" && !drewImage) {
        w.text("[The drawn signature image could not be embedded; its SHA-256 is listed below.]", {
          font: regular,
          size: 8.5,
          indent: 10,
        });
      }
      if (r.signatureSha256) {
        w.text(`Signature SHA-256: ${r.signatureSha256}`, { font: mono, size: 7, indent: 10, lineHeight: 10 });
      }
    }
    w.space(8);
  }
  w.rule(8);
  w.text(
    "How to check this document: open the verification link or scan the QR code. It shows the SHA-256 of the final file (this whole PDF, including these pages), which a file cannot contain about itself. If the SHA-256 of your copy matches, the file has not changed since completion. Times are Indian Standard Time.",
    { font: regular, size: 8, color: MUTED, lineHeight: 11 },
  );

  stampPageNumbers(doc, regular, firstCertPage, `Vaakil AI certificate of completion · ${cert.envelopeId}`);
  return doc.save();
}
