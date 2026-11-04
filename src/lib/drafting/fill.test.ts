import { describe, expect, it } from "vitest";
import {
  amountInWords,
  fillTemplate,
  findPlaceholders,
  formatDateLong,
  formatDateShort,
  formatIndianNumber,
  integerToIndianWords,
  numberParagraphs,
  ordinal,
  validateInputs,
} from "./fill";
import { parseDraft, stripMarkup } from "./markup";
import { getTemplate, templateBody, templateCatalog } from "./catalog";
import type { TemplateField } from "./types";

const fields: TemplateField[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "amount", label: "Amount", type: "number", required: true },
  { name: "when", label: "Date", type: "date", required: true },
  {
    name: "reason",
    label: "Reason",
    type: "select",
    required: true,
    options: [{ value: "funds", label: "Funds Insufficient", hi: "अपर्याप्त निधि" }],
  },
  { name: "note", label: "Note", type: "textarea", fallback: "No note." },
  { name: "optional", label: "Optional", type: "text" },
];

describe("number and date formatting", () => {
  it("groups digits the Indian way", () => {
    expect(formatIndianNumber(150000)).toBe("1,50,000");
    expect(formatIndianNumber(12345678)).toBe("1,23,45,678");
    expect(formatIndianNumber(1234.5)).toBe("1,234.50");
  });

  it("writes amounts in words with lakh and crore", () => {
    expect(integerToIndianWords(0)).toBe("Zero");
    expect(integerToIndianWords(15)).toBe("Fifteen");
    expect(integerToIndianWords(105)).toBe("One Hundred Five");
    expect(integerToIndianWords(150000)).toBe("One Lakh Fifty Thousand");
    expect(integerToIndianWords(12345678)).toBe("One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight");
    expect(integerToIndianWords(1000000000)).toBe("One Hundred Crore");
    expect(amountInWords(2500.5)).toBe("Two Thousand Five Hundred and Fifty Paise");
  });

  it("formats dates for pleadings", () => {
    expect(formatDateShort("2026-03-07")).toBe("07.03.2026");
    expect(formatDateLong("2026-03-07")).toBe("7 March 2026");
    expect(formatDateLong("2026-03-07", "hi")).toBe("7 मार्च 2026");
    expect(formatDateShort("not a date")).toBe("not a date");
  });

  it("makes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "28th",
    ]);
  });

  it("numbers paragraphs and keeps existing numbering", () => {
    expect(numberParagraphs("That A.\n\nThat B.\n")).toBe("1. That A.\n\n2. That B.");
    expect(numberParagraphs("1. That A.\n2) That B.")).toBe("1. That A.\n\n2) That B.");
  });
});

describe("fillTemplate", () => {
  const values = { name: "Asha Verma", amount: "150000", when: "2026-10-01", reason: "funds" };

  it("fills values with type-aware formatting and filters", () => {
    const out = fillTemplate(
      "{{name}} paid ₹{{amount|inr}}/- (Rupees {{amount|words}} only) on {{when}} ({{when|long}}). Reason: {{reason}}. {{name|upper}}",
      fields,
      values,
    );
    expect(out).toBe(
      "Asha Verma paid ₹1,50,000/- (Rupees One Lakh Fifty Thousand only) on 01.10.2026 (1 October 2026). Reason: Funds Insufficient. ASHA VERMA",
    );
  });

  it("uses Hindi option labels and month names in Hindi drafts", () => {
    expect(fillTemplate("{{reason}} {{when|long}}", fields, values, "hi")).toBe("अपर्याप्त निधि 1 अक्टूबर 2026");
  });

  it("uses fallbacks and keeps unfilled or unknown tokens visible", () => {
    const out = fillTemplate("{{note}} {{optional}} {{unknown}} {{ name }}", fields, { name: "" });
    expect(out).toBe("No note. {{optional}} {{unknown}} {{ name }}");
  });

  it("repeats a line prefix for multi-line values", () => {
    const out = fillTemplate(">> {{addr}}\nTo,\n{{addr}}", [{ name: "addr", label: "Address", type: "textarea" }], {
      addr: "Chamber 4\nLucknow",
    });
    expect(out).toBe(">> Chamber 4\n>> Lucknow\nTo,\nChamber 4\nLucknow");
  });

  it("does not re-interpret placeholders inside user values", () => {
    expect(fillTemplate("{{name}}", fields, { name: "{{amount}}" })).toBe("{{amount}}");
  });

  it("lists remaining placeholders", () => {
    expect(findPlaceholders("{{a}} {{b|inr}} {{a}}")).toEqual(["a", "b"]);
  });
});

describe("validateInputs", () => {
  it("reports required, type and option errors", () => {
    const r = validateInputs(fields, { name: " ", amount: "abc", when: "2026-13-40", reason: "nope" });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(["amount", "name", "reason", "when"]);
  });

  it("returns trimmed clean values for known fields only", () => {
    const r = validateInputs(fields, { name: " Asha ", amount: "1,50,000", when: "2026-10-01", reason: "funds", extra: "x" });
    expect(r.ok).toBe(true);
    expect(r.clean).toEqual({ name: "Asha", amount: "1,50,000", when: "2026-10-01", reason: "funds" });
  });
});

describe("markup", () => {
  it("parses headings, alignment, bold and placeholders", () => {
    const blocks = parseDraft("# TITLE\n\n^^ centre\n>> right one\n>> right two\n\nPara **bold** {{x}}\nline two\n\n---\n===");
    expect(blocks.map((b) => b.kind)).toEqual(["title", "center", "right", "para", "separator", "pagebreak"]);
    const right = blocks[2];
    expect(right.kind === "right" && right.lines.length).toBe(2);
    const para = blocks[3];
    if (para.kind !== "para") throw new Error("expected para");
    expect(para.lines[0]).toEqual([{ text: "Para " }, { text: "bold", bold: true }, { text: " " }, { text: "{{x}}", placeholder: "x" }]);
    expect(para.lines[1]).toEqual([{ text: "line two" }]);
  });

  it("strips markup to plain text", () => {
    expect(stripMarkup("# T\n>> R\n**b** c\n---")).toBe("T\nR\nb c\n");
  });
});

describe("catalogue", () => {
  it("has unique slugs and the required coverage", () => {
    const slugs = templateCatalog.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(templateCatalog.length).toBeGreaterThanOrEqual(15);
    expect(templateCatalog.filter((t) => t.bodyHi).length).toBeGreaterThanOrEqual(5);
    expect(getTemplate("general-power-of-attorney")?.esignAllowed).toBe(false);
    expect(getTemplate("simple-will")?.esignAllowed).toBe(false);
    expect(templateCatalog.every((t) => t.reviewedBy === null)).toBe(true);
  });

  it("only uses placeholders that are defined fields, with unique field names", () => {
    for (const t of templateCatalog) {
      const names = t.fields.map((f) => f.name);
      expect(new Set(names).size, t.slug).toBe(names.length);
      for (const lang of ["en", "hi"] as const) {
        if (lang === "hi" && !t.bodyHi) continue;
        for (const p of findPlaceholders(templateBody(t, lang))) expect(names, `${t.slug} ${lang} {{${p}}}`).toContain(p);
      }
      for (const f of t.fields) {
        if (f.type === "select") expect(f.options?.length, `${t.slug}.${f.name}`).toBeGreaterThan(0);
      }
    }
  });

  it("fills completely when every field has a value", () => {
    for (const t of templateCatalog) {
      const values: Record<string, string> = {};
      for (const f of t.fields) {
        values[f.name] =
          f.type === "date" ? "2026-10-01" : f.type === "number" ? String(f.min ?? 1) : f.type === "select" ? f.options![0].value : "Sample";
      }
      expect(validateInputs(t.fields, values).ok, t.slug).toBe(true);
      expect(findPlaceholders(fillTemplate(t.bodyEn, t.fields, values, "en")), t.slug).toEqual([]);
      if (t.bodyHi) expect(findPlaceholders(fillTemplate(t.bodyHi, t.fields, values, "hi")), t.slug).toEqual([]);
    }
  });
});
