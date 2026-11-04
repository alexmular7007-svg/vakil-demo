import { describe, expect, it } from "vitest";
import {
  anchorWord,
  citationKey,
  citationKeys,
  findCaseNames,
  findCitations,
  judgmentLabel,
  orTsQuery,
  parseCaseName,
  pickParagraphs,
  requiredCoverage,
  significantTerms,
  termCoverage,
  titleMatchesCaseName,
} from "./cite";

describe("citations", () => {
  it("finds reporter and neutral citations", () => {
    const text = "See (2014) 8 SCC 273, AIR 1980 SC 898, 2024 INSC 735, [2024] 10 S.C.R. 108, 2023 SCC OnLine SC 123 and 2024:DHC:1234.";
    expect(findCitations(text)).toEqual(["(2014) 8 SCC 273", "AIR 1980 SC 898", "2024 INSC 735", "[2024] 10 S.C.R. 108", "2023 SCC OnLine SC 123", "2024:DHC:1234"]);
  });

  it("normalises brackets, spacing and dots", () => {
    expect(citationKey("(2014) 8 SCC 273")).toBe(citationKey("[2014] 8 S.C.C. 273"));
    expect(citationKey("[2024] 10 S.C.R. 108")).toBe(citationKey("(2024) 10 SCR 108"));
    expect(citationKey("2024 INSC 735")).toBe("2024INSC735");
  });

  it("reads every citation stored in a judgment's citation field", () => {
    expect(citationKeys("2024 INSC 735; [2024] 10 S.C.R. 108")).toEqual(expect.arrayContaining(["2024INSC735", "202410SCR108"]));
    expect(citationKeys(null)).toEqual([]);
  });
});

describe("case names", () => {
  it("finds case names and strips leading connectives and suffixes", () => {
    const names = findCaseNames("See Arnesh Kumar v. State of Bihar, (2014) 8 SCC 273, and Lalita Kumari vs. Govt. of U.P. & Ors.");
    expect(names.map((n) => [n.first, n.second])).toEqual([
      ["arnesh kumar", "state of bihar"],
      ["lalita kumari", "govt of u p"],
    ]);
  });

  it("separates two cases joined by 'and' but keeps 'and Others'", () => {
    const names = findCaseNames("See Vijay Singh v. State of Bihar and Arnesh Kumar v. State of Bihar; also Rama Devi v. State of Bihar and Others.");
    expect(names.map((n) => [n.first, n.second])).toEqual([
      ["vijay singh", "state of bihar"],
      ["arnesh kumar", "state of bihar"],
      ["rama devi", "state of bihar"],
    ]);
  });

  it("ignores statute references and generic pairs", () => {
    expect(findCaseNames("Section 302 v. Section 304 of the IPC")).toEqual([]);
    expect(parseCaseName("State v. Union of India")).toBeNull();
  });

  it("matches a library title regardless of case, punctuation and '& Ors.'", () => {
    const ref = parseCaseName("Vijay Singh v. State of Bihar")!;
    expect(titleMatchesCaseName("VIJAY SINGH @ VIJAY KR. SHARMA versus THE STATE OF BIHAR", ref)).toBe(true);
    expect(titleMatchesCaseName("Vijay Singh & Ors. v. The State of Bihar & Anr.", ref)).toBe(true);
    expect(titleMatchesCaseName("State of Bihar v. Vijay Singh", ref)).toBe(false);
    expect(titleMatchesCaseName("Vijay Singhania v. State of Bihar", ref)).toBe(false);
  });

  it("picks a distinctive word for the database lookup", () => {
    expect(anchorWord("state of maharashtra")).toBe("maharashtra");
    expect(anchorWord("arnesh kumar")).toBe("arnesh");
  });
});

describe("retrieval ranking", () => {
  it("keeps distinctive words and section numbers, drops stop words", () => {
    expect(significantTerms("What is the law on anticipatory bail under section 438 of the CrPC?")).toEqual(["anticipatory", "bail", "438", "crpc"]);
    expect(orTsQuery(["bail", "438"])).toBe("bail | 438");
    expect(orTsQuery([])).toBeNull();
  });

  it("requires half the terms, between 2 and 4", () => {
    expect([1, 2, 3, 5, 7, 12].map(requiredCoverage)).toEqual([1, 2, 2, 3, 4, 4]);
  });

  it("counts term coverage with crude stemming", () => {
    expect(termCoverage("The accused murdered the victim after abduction.", ["murder", "abducted", "dowry"])).toBe(2);
  });

  it("puts exact case matches first, filters weak hits and limits paragraphs per judgment", () => {
    const terms = ["circumstantial", "evidence", "chain"];
    const picked = pickParagraphs(
      [
        { judgmentId: "a", paraNo: 1, text: "circumstantial evidence chain", score: 0.9 },
        { judgmentId: "a", paraNo: 2, text: "circumstantial evidence", score: 0.8 },
        { judgmentId: "a", paraNo: 3, text: "the chain of circumstantial evidence", score: 0.7 },
        { judgmentId: "b", paraNo: 4, text: "evidence only", score: 0.95 },
        { judgmentId: "c", paraNo: 0, text: "cause title", score: 0, exact: true },
        { judgmentId: "a", paraNo: 1, text: "circumstantial evidence chain", score: 0.9 },
      ],
      { limit: 5, perJudgment: 2, terms },
    );
    expect(picked.map((p) => `${p.judgmentId}${p.paraNo}`)).toEqual(["c0", "a1", "a2"]);
  });

  it("labels a source with case, court, date, citation and paragraph", () => {
    expect(
      judgmentLabel({ title: "A v. B", court: "Supreme Court of India", decidedOn: "2024-09-25", citation: "2024 INSC 735; [2024] 10 S.C.R. 108" }, 12),
    ).toBe("A v. B (Supreme Court of India, decided 25 Sept 2024), 2024 INSC 735, para 12");
    expect(judgmentLabel({ title: "A v. B", court: "Delhi High Court", decidedOn: null, citation: null }, 0)).toBe(
      "A v. B (Delhi High Court), headnote / cause title",
    );
  });
});
