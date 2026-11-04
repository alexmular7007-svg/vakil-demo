import { describe, expect, it } from "vitest";
import {
  compareSectionNos,
  isSectionNo,
  maxSafeRemovals,
  normaliseSectionNo,
  planSectionEdits,
  sectionFingerprint,
  sectionProblem,
  sortKeyForNew,
  SYNC_SAFETY,
  unsafePlanReason,
} from "./plan";

const sec = (sectionNo: string, heading = `Heading ${sectionNo}`, text = `Text of ${sectionNo}.`, chapter: string | null = null) => ({ sectionNo, heading, text, chapter });

describe("section numbers", () => {
  it("normalises what people type and accepts only real section numbers", () => {
    expect(normaliseSectionNo(" s. 498 a ")).toBe("498A");
    expect(normaliseSectionNo("Section 103")).toBe("103");
    expect(isSectionNo("53AA")).toBe(true);
    expect(isSectionNo("124-A")).toBe(false);
    expect(isSectionNo("12345")).toBe(false);
    expect(isSectionNo("3a")).toBe(false);
  });

  it("orders by number, then suffix", () => {
    const nos = ["376B", "376", "376AB", "10", "9", "376DA", "376A", "376D", "377"];
    expect([...nos].sort(compareSectionNos)).toEqual(["9", "10", "376", "376A", "376AB", "376B", "376D", "376DA", "377"]);
  });
});

describe("sectionProblem", () => {
  it("accepts a normal section and names the first problem otherwise", () => {
    expect(sectionProblem(sec("103"))).toBeNull();
    expect(sectionProblem(sec("1O3"))?.code).toBe("invalid_section_no");
    expect(sectionProblem(sec("103", "   "))?.code).toBe("invalid_heading");
    expect(sectionProblem(sec("103", "h", ""))?.code).toBe("invalid_text");
    expect(sectionProblem(sec("103", "h", "x".repeat(200_001)))?.code).toBe("invalid_text");
    expect(sectionProblem(sec("103", "h".repeat(501)))?.code).toBe("invalid_heading");
    expect(sectionProblem(sec("103", "h", "bad\u0000text"))?.code).toBe("invalid_text");
    expect(sectionProblem({ ...sec("103"), chapter: "c".repeat(301) })?.code).toBe("invalid_chapter");
    expect(sectionProblem({ ...sec("103"), sortKey: 1.5 })?.code).toBe("invalid_sort_key");
    // Tabs and line breaks are ordinary statute formatting.
    expect(sectionProblem(sec("103", "h", "(1) First.\n\n(2)\tSecond."))).toBeNull();
  });
});

describe("planSections", () => {
  const current = [sec("1"), sec("2"), sec("3", "Old heading"), sec("4")];

  it("sorts the new text into added, changed, unchanged and removed", () => {
    const next = [sec("1"), sec("2", "Heading 2", "Amended text."), sec("3"), sec("3A")];
    const plan = planSectionEdits(current, next, { removeMissing: true });
    expect(plan.added.map((s) => s.sectionNo)).toEqual(["3A"]);
    expect(plan.changed.map((s) => s.sectionNo)).toEqual(["2", "3"]);
    expect(plan.unchanged).toEqual(["1"]);
    expect(plan.removed).toEqual(["4"]);
  });

  it("leaves missing sections alone unless asked, and never removes kept ones", () => {
    expect(planSectionEdits(current, [sec("1")]).removed).toEqual([]);
    expect(planSectionEdits(current, [sec("1")], { removeMissing: true, keep: ["2", "4"] }).removed).toEqual(["3"]);
  });

  it("ignores surrounding whitespace, and compares the chapter only when one is given", () => {
    const withChapter = [sec("1", "Heading 1", "Text of 1.", "Chapter I")];
    expect(planSectionEdits(withChapter, [{ sectionNo: "1", heading: " Heading 1 ", text: "Text of 1.\n" }]).unchanged).toEqual(["1"]);
    expect(planSectionEdits(withChapter, [{ ...sec("1"), chapter: undefined }]).unchanged).toEqual(["1"]);
    expect(planSectionEdits(withChapter, [{ ...sec("1"), chapter: "Chapter II" }]).changed).toHaveLength(1);
  });

  it("keeps the first of a repeated section and reports the repeat", () => {
    const plan = planSectionEdits([], [sec("5"), sec("5", "Other")]);
    expect(plan.added).toHaveLength(1);
    expect(plan.added[0].heading).toBe("Heading 5");
    expect(plan.duplicates).toEqual(["5"]);
  });

  it("gives the browser (fingerprints only) the same answer as the server (full text)", () => {
    const next = [sec("1"), sec("2", "Heading 2", "Amended text."), sec("5")];
    const server = planSectionEdits(current, next, { removeMissing: true });
    const browser = planSectionEdits(
      current.map((c) => ({ sectionNo: c.sectionNo, chapter: c.chapter, fingerprint: sectionFingerprint(c.heading, c.text) })),
      next,
      { removeMissing: true },
    );
    expect(browser).toEqual(server);
    expect(sectionFingerprint(" a ", "b\n")).toBe(sectionFingerprint("a", "b"));
    expect(sectionFingerprint("a", "b")).not.toBe(sectionFingerprint("a", "c"));
  });
});

describe("safety rule", () => {
  it("refuses reads with under 70 % of the sections or too many removals", () => {
    expect(SYNC_SAFETY.minSectionRatio).toBe(0.7);
    expect(unsafePlanReason({ removed: [] }, 100, 69, { source: "India Code" })).toMatch(/^India Code returned 69 sections where the corpus has 100/);
    expect(unsafePlanReason({ removed: [] }, 100, 70)).toBeNull();
    expect(maxSafeRemovals(100)).toBe(10);
    expect(maxSafeRemovals(531)).toBe(54);
    expect(unsafePlanReason({ removed: Array(11).fill("x") }, 100, 95)).toMatch(/11 sections would be removed/);
    expect(unsafePlanReason({ removed: Array(10).fill("x") }, 100, 95)).toBeNull();
  });

  it("takes other limits when a caller needs them", () => {
    const strict = { minSectionRatio: 0.95, maxRemovalsFloor: 0, maxRemovalRatio: 0 };
    expect(unsafePlanReason({ removed: [] }, 100, 94, { limits: strict })).not.toBeNull();
    expect(unsafePlanReason({ removed: ["1"] }, 100, 100, { limits: strict })).toMatch(/1 sections would be removed/);
  });
});

describe("sortKeyForNew", () => {
  const keys = [
    { sectionNo: "1", sortKey: 10 },
    { sectionNo: "2", sortKey: 20 },
    { sectionNo: "3", sortKey: 30 },
    { sectionNo: "3B", sortKey: 34 },
  ];

  it("places a section after its nearest lower number", () => {
    expect(sortKeyForNew(keys, "2A")).toBe(25);
    expect(sortKeyForNew(keys, "3A")).toBe(32); // between 3 and 3B, not after 3B
    expect(sortKeyForNew(keys, "4")).toBe(44);
    expect(sortKeyForNew(keys, "0")).toBe(5);
    expect(sortKeyForNew([], "1")).toBe(10);
  });

  it("asks for renumbering when there is no gap", () => {
    expect(sortKeyForNew([{ sectionNo: "1", sortKey: 10 }, { sectionNo: "2", sortKey: 11 }], "1A")).toBeNull();
  });
});
