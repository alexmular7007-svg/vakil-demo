// Neutralises untrusted text (statute text, judgment paragraphs, the user's
// documents and their names, assistant instructions) before it goes into a
// prompt, so it cannot close or forge the prompt's delimiters, hide text, or
// fake source markers. Pure: no server dependencies.

// C0/C1 control characters except tab and newline (carriage returns are normalised first).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

// Invisible or direction-changing characters used to hide or reorder text:
// zero-width space, word joiner, BOM, soft hyphen, bidi embeddings/overrides/isolates,
// deprecated format characters, variation selectors and Unicode "tag" characters.
// ZWJ/ZWNJ (U+200D/U+200C) stay: Devanagari and other Indic scripts need them.
const INVISIBLE = /[​⁠-⁤﻿­؜‎‏‪-‮⁦-⁩⁪-⁯︀-️]|[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;

// Angle brackets and their look-alikes become single guillemets, so no source
// text can form "<", "</source>", "<system>" or any other tag.
const OPEN_ANGLE = /[<＜﹤〈〈⟨❬❰˂]/g;
const CLOSE_ANGLE = /[>＞﹥〉〉⟩❭❱˃]/g;

// "[S3]", "[ s 12 ]", fullwidth "［S3］": only the prompt itself may number sources.
const SOURCE_MARKER = /[[［]\s*[SsＳｓ]\s*(\d{1,4})\s*[\]］]/g;

/** Safe multi-line text for inside a delimited block. */
export function sanitizeUntrusted(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(INVISIBLE, "")
    .replace(OPEN_ANGLE, "‹")
    .replace(CLOSE_ANGLE, "›")
    .replace(SOURCE_MARKER, "(S$1)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Safe single-line text (labels, names, titles): no line breaks, so it cannot start a fake header. */
export function sanitizeInline(text: string, maxChars = 300): string {
  const flat = sanitizeUntrusted(text).replace(/\s+/g, " ");
  return flat.length > maxChars ? `${flat.slice(0, maxChars - 1)}…` : flat;
}
