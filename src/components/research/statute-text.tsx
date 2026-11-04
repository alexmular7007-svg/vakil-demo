import { cn } from "@/lib/utils";

// Renders bare-act text. Paragraph indentation comes from the source (India Code
// HTML or the PDF layout); text from the database has none, so it is inferred from
// clause markers. Footnote markers (Unicode superscripts) link to the footnote list.

export type StatuteParagraph = { text: string; indent: number };

const SUP_TO_DIGIT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
const SUP_RUN = /([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/;

const ROMAN = /^\((?:ii|iii|iv|vi|vii|viii|ix|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)\)/;

function stripMarkers(t: string) {
  return t.replace(/^(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*\[?\s*)+/, "").replace(/^\[\s*/, "");
}

/** Indentation for text without layout information. */
export function inferParagraphs(text: string): StatuteParagraph[] {
  const parts = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let lastLetter = false;
  return parts.map((p) => {
    const t = stripMarkers(p);
    let indent = 0;
    if (/^\(\d+[A-Z]?\)/.test(t)) {
      indent = 0;
      lastLetter = false;
    } else if (/^\(i\)/.test(t)) {
      indent = lastLetter ? 1 : 2;
    } else if (ROMAN.test(t)) {
      indent = 2;
    } else if (/^\([a-z]{1,2}\)/.test(t)) {
      indent = 1;
      lastLetter = true;
    } else if (/^(Explanation|Provided|Illustrations?|Exception)\b/.test(t)) {
      indent = 0;
      lastLetter = false;
    }
    return { text: p, indent };
  });
}

function isSubheading(t: string) {
  const s = stripMarkers(t).replace(/\]$/, "").replace(/\.$/, "").trim();
  return /^(illustrations?|state amendments?|exceptions?)$/i.test(s);
}

function withFootnoteLinks(text: string, idPrefix: string, max: number) {
  const parts = text.split(SUP_RUN);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const n = Number([...part].map((c) => SUP_TO_DIGIT[c]).join(""));
    if (!n || n > max) return <sup key={i}>{n}</sup>;
    return (
      <a key={i} href={`#${idPrefix}-fn-${n}`} className="no-underline" aria-label={`Footnote ${n}`}>
        <sup className="px-px font-semibold text-primary">{n}</sup>
      </a>
    );
  });
}

export function StatuteText({
  paragraphs,
  footnotes = [],
  idPrefix = "s",
  className,
}: {
  paragraphs: StatuteParagraph[];
  footnotes?: string[];
  idPrefix?: string;
  className?: string;
}) {
  return (
    <div className={cn("text-[15px] leading-7 text-ink-2 sm:text-base sm:leading-8", className)}>
      <div className="space-y-3">
        {paragraphs.map((p, i) =>
          isSubheading(p.text) ? (
            <p key={i} className="pt-2 text-center text-xs font-semibold tracking-[0.12em] text-muted uppercase">
              {withFootnoteLinks(p.text, idPrefix, footnotes.length)}
            </p>
          ) : (
            <p key={i} className="break-words" style={p.indent ? { paddingLeft: `${Math.min(p.indent, 4) * 1.25}rem` } : undefined}>
              {withFootnoteLinks(p.text, idPrefix, footnotes.length)}
            </p>
          ),
        )}
      </div>
      {footnotes.length > 0 ? (
        <div className="mt-8 border-t border-border pt-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Footnotes (amendment history)</h2>
          <ol className="space-y-1.5 text-[13px] leading-relaxed text-muted">
            {footnotes.map((f, i) => (
              <li key={i} id={`${idPrefix}-fn-${i + 1}`} className="flex gap-2 scroll-mt-24">
                <span className="w-5 shrink-0 text-right font-medium text-ink-2">{i + 1}.</span>
                <span className="min-w-0 break-words">{f}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** Splits database text ("body\n\nFootnotes:\n1. …") into paragraphs and footnotes. */
export function splitStoredText(text: string): { paragraphs: StatuteParagraph[]; footnotes: string[] } {
  const idx = text.lastIndexOf("\n\nFootnotes:\n");
  const body = idx >= 0 ? text.slice(0, idx) : text;
  const notes = idx >= 0 ? text.slice(idx + "\n\nFootnotes:\n".length).split("\n").map((l) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean) : [];
  return { paragraphs: inferParagraphs(body), footnotes: notes };
}
