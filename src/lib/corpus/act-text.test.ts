import { describe, expect, it } from "vitest";
import { revisionLines, splitActText } from "./act-text";

const ACT = `THE EXAMPLE SANHITA, 2026
ACT NO. 9 OF 2026
BE it enacted by Parliament as follows:—
CHAPTER I
PRELIMINARY
1. Short title, extent and commencement.—(1) This Act may be called the Example Sanhita,
2026.
(2) It extends to the whole of India.
2. Definitions.—In this Sanhita, unless the context otherwise requires,—
(a) "court" means a court of law;
(b) "offence" means a non-
bailable act.
Explanation.—A writing is a document.
CHAPTER II
OF OFFENCES AGAINST THE STATE
3. Waging war.
Whoever wages war shall be punished with imprisonment for life.
3A. Preparation to wage war.—Whoever prepares to wage war shall be punished with
imprisonment which may extend to ten years.
4. Punishments.—The punishments are—
1. death;
2. imprisonment for life.
5. [Omitted.]
`;

describe("splitActText", () => {
  const { sections, warnings } = splitActText(ACT);

  it("finds every numbered section, including lettered ones, in order", () => {
    expect(sections.map((s) => s.sectionNo)).toEqual(["1", "2", "3", "3A", "4", "5"]);
  });

  it("separates the heading from the text at the dash", () => {
    expect(sections[0].heading).toBe("Short title, extent and commencement");
    expect(sections[0].text).toBe("(1) This Act may be called the Example Sanhita, 2026.\n\n(2) It extends to the whole of India.");
  });

  it("starts a new paragraph for clauses and explanations and keeps hyphenated words whole", () => {
    expect(sections[1].text).toBe(
      'In this Sanhita, unless the context otherwise requires,—\n\n(a) "court" means a court of law;\n\n(b) "offence" means a non-bailable act.\n\nExplanation.—A writing is a document.',
    );
  });

  it("takes a heading on its own line when there is no dash", () => {
    expect(sections[2].heading).toBe("Waging war");
    expect(sections[2].text).toBe("Whoever wages war shall be punished with imprisonment for life.");
  });

  it("does not mistake a numbered list inside a section for new sections", () => {
    expect(sections[4].sectionNo).toBe("4");
    expect(sections[4].text).toBe("The punishments are— 1. death; 2. imprisonment for life.");
  });

  it("carries chapter headings in the stored format", () => {
    expect(sections[0].chapter).toBe("Chapter I: Preliminary");
    expect(sections[3].chapter).toBe("Chapter II: Of Offences against the State");
  });

  it("uses the heading as text for an omitted section and says so", () => {
    expect(sections[5]).toMatchObject({ sectionNo: "5", heading: "[Omitted.]", text: "[Omitted.]" });
    expect(warnings.some((w) => w.includes("5 had no text"))).toBe(true);
    expect(warnings.some((w) => w.includes("before the first section"))).toBe(true);
  });

  it("keeps only the first of two sections with the same number", () => {
    const r = splitActText("1. One.—First.\n2. Two.—Second.\n2A. Two A.—x\n2A. Again.—y");
    expect(r.sections.map((s) => s.sectionNo)).toEqual(["1", "2", "2A"]);
  });

  it("returns nothing for text without numbered sections", () => {
    expect(splitActText("Just a note.").sections).toEqual([]);
  });
});

describe("revisionLines", () => {
  it("splits paragraphs and sentences for a finer diff", () => {
    expect(revisionLines("(1) First rule. Second rule applies.\n\n(2) Third.")).toEqual(["(1) First rule.", "Second rule applies.", "(2) Third."]);
    expect(revisionLines(null)).toEqual([]);
  });
});
