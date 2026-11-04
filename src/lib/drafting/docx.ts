import "server-only";
import {
  AlignmentType,
  Document,
  Footer,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  TextRun,
  UnderlineType,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import { humanizePlaceholder } from "./fill";
import { isShortLineBlock, parseDraft, type Block, type Line } from "./markup";

// Times New Roman for Latin text, Mangal for Devanagari (Word uses the
// complex-script font for Hindi). Sizes are in half-points.
const FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Mangal" };
const SIZE = 24; // 12 pt

function runs(lines: Line[], base: Partial<IRunOptions> = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  lines.forEach((line, li) => {
    line.forEach((r, ri) => {
      const first = li > 0 && ri === 0;
      const opts: IRunOptions = {
        font: FONT,
        size: base.size ?? SIZE,
        sizeComplexScript: base.size ?? SIZE,
        bold: Boolean(r.bold || base.bold),
        boldComplexScript: Boolean(r.bold || base.bold),
        underline: base.underline,
        break: first ? 1 : undefined,
        text: r.placeholder ? `[${humanizePlaceholder(r.placeholder)}]` : r.text,
        highlight: r.placeholder ? "yellow" : undefined,
      };
      out.push(new TextRun(opts));
    });
    // A line with no runs (shouldn't happen) still needs its break.
    if (line.length === 0 && li > 0) out.push(new TextRun({ break: 1 }));
  });
  return out;
}

function toParagraphs(block: Block): Paragraph[] {
  const spacing = { after: 160, line: 360 }; // 8 pt after, 1.5 line spacing
  switch (block.kind) {
    case "separator":
      return [new Paragraph({ spacing })];
    case "pagebreak":
      return [new Paragraph({ children: [new PageBreak()] })];
    case "title":
      return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 240, line: 360 }, children: runs(block.lines, { bold: true, size: 26 }) })];
    case "heading":
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 160, line: 360 },
          children: runs(block.lines, { bold: true, underline: { type: UnderlineType.SINGLE } }),
        }),
      ];
    case "subheading":
      return [new Paragraph({ spacing: { before: 200, after: 120, line: 360 }, children: runs(block.lines, { bold: true }) })];
    case "center":
      return [new Paragraph({ alignment: AlignmentType.CENTER, spacing, children: runs(block.lines) })];
    case "right":
      return [new Paragraph({ alignment: AlignmentType.RIGHT, spacing, children: runs(block.lines) })];
    case "para":
      return [
        new Paragraph({
          alignment: isShortLineBlock(block.lines) ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
          spacing,
          children: runs(block.lines),
        }),
      ];
  }
}

/** Builds an A4 Word document from draft markup, with page numbers in the footer. */
export async function draftToDocx(body: string, opts: { title: string; language: "en" | "hi" }): Promise<Buffer> {
  const blocks = parseDraft(body);
  const doc = new Document({
    title: opts.title,
    creator: "Vaakil AI",
    // Justified paragraphs must not stretch lines that end in a manual break (addresses, cause titles).
    compatibility: { doNotExpandShiftReturn: true },
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE, sizeComplexScript: SIZE, language: { value: opts.language === "hi" ? "hi-IN" : "en-IN" } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 in twips
            margin: { top: 1247, bottom: 1247, left: 1418, right: 1134 }, // 2.2 cm, 2.5 cm left binding margin, 2 cm right
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ font: FONT, size: 18, children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES] })],
              }),
            ],
          }),
        },
        children: blocks.length ? blocks.flatMap(toParagraphs) : [new Paragraph({ children: [] })],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** ASCII fallback plus RFC 5987 UTF-8 filename for Hindi titles. */
export function contentDisposition(title: string, ext: string): string {
  const ascii =
    title
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "draft";
  const utf8 = encodeURIComponent(`${title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "draft"}.${ext}`);
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${utf8}`;
}
