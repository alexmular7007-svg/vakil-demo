import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/corpus/search", async (orig) => {
  const actual = await orig<typeof import("@/lib/corpus/search")>();
  return { ...actual, searchStatutes: vi.fn(async () => []), searchStatutesMarked: vi.fn(async () => []) };
});

vi.mock("@/lib/judgments/queries", () => ({
  judgmentCandidates: vi.fn(async () => ({ candidates: [], terms: [] })),
}));

import { matterNote, retrieveJudgmentSources, retrieveSources } from "./retrieval";
import { governingCriminalCode, searchStatutesMarked } from "@/lib/corpus/search";
import { judgmentCandidates } from "@/lib/judgments/queries";
import type { Tx } from "@/lib/db";

const judgment = {
  id: "11111111-1111-4111-8111-111111111111",
  court: "Supreme Court of India",
  title: "Arnesh Kumar v. State of Bihar",
  decidedOn: "2014-07-02",
  citation: "(2014) 8 SCC 273",
  caseNo: null,
  bench: null,
};
const other = { ...judgment, id: "22222222-2222-4222-8222-222222222222", title: "Other v. Party", citation: null };

describe("criminal code by offence date", () => {
  it("applies the IPC to offences before 1 July 2024", () => {
    expect(governingCriminalCode("2024-06-30")).toBe("IPC");
    expect(matterNote("2024-03-15")).toMatch(/IPC, CrPC and Indian Evidence Act govern/);
  });

  it("applies the BNS from 1 July 2024 (IST)", () => {
    expect(governingCriminalCode("2024-07-01")).toBe("BNS");
    expect(matterNote("2024-08-12")).toMatch(/BNS, BNSS and BSA govern/);
  });

  it("returns no note without a date", () => {
    expect(matterNote(null)).toBeNull();
  });
});

describe("judgment retrieval", () => {
  it("labels paragraphs with case, court, date, citation and paragraph number", async () => {
    vi.mocked(judgmentCandidates).mockResolvedValueOnce({
      terms: ["arrest", "498a"],
      candidates: [
        { judgmentId: judgment.id, paraNo: 11, text: "No arrest should be made only because the offence under 498A is non-bailable.", score: 1.2, judgment },
        // Mentions only one of the two terms: dropped.
        { judgmentId: other.id, paraNo: 3, text: "The arrest was illegal.", score: 2, judgment: other },
      ],
    });
    const sources = await retrieveJudgmentSources("arrest in 498A cases");
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      kind: "judgment",
      label: "Arnesh Kumar v. State of Bihar (Supreme Court of India, decided 2 Jul 2014), (2014) 8 SCC 273, para 11",
      href: `/app/research/case/${judgment.id}#para-11`,
      meta: { judgmentId: judgment.id, paraNo: 11 },
    });
  });

  it("keeps a case the question names even when its paragraphs share few words", async () => {
    vi.mocked(judgmentCandidates).mockResolvedValueOnce({
      terms: ["guidelines", "arrest", "police"],
      candidates: [{ judgmentId: judgment.id, paraNo: 0, text: "Cause title", score: 0, exact: true, judgment }],
    });
    const sources = await retrieveJudgmentSources("What did Arnesh Kumar v. State of Bihar say?");
    expect(sources.map((s) => s.label)).toEqual(["Arnesh Kumar v. State of Bihar (Supreme Court of India, decided 2 Jul 2014), (2014) 8 SCC 273, headnote / cause title"]);
    expect(sources[0].href).toBe(`/app/research/case/${judgment.id}`);
  });

  it("numbers statutes first, then judgments, as S1, S2 …", async () => {
    vi.mocked(searchStatutesMarked).mockResolvedValueOnce([
      { actId: "BNS", actTitle: "Bharatiya Nyaya Sanhita, 2023", sectionNo: "85", heading: "Cruelty", snippet: "", snippetMarked: "", text: "Whoever…", score: 1, exact: false },
    ]);
    vi.mocked(judgmentCandidates).mockResolvedValueOnce({
      terms: ["cruelty"],
      candidates: [{ judgmentId: judgment.id, paraNo: 7, text: "Cruelty under section 498A…", score: 1, judgment }],
    });
    const sources = await retrieveSources({} as Tx, { question: "cruelty", documentIds: [] });
    expect(sources.map((s) => [s.id, s.kind])).toEqual([
      ["S1", "statute"],
      ["S2", "judgment"],
    ]);
  });

  it("still answers from statutes when the judgments library cannot be read", async () => {
    vi.mocked(judgmentCandidates).mockRejectedValueOnce(new Error("relation does not exist"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const sources = await retrieveSources({} as Tx, { question: "bail", documentIds: [] });
    expect(sources).toEqual([]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("marks sections the question names as exact and trims long text at a sentence boundary", async () => {
    const long = Array.from({ length: 80 }, (_, i) => `Clause ${i + 1} sets out one rule of the section.`).join(" ");
    vi.mocked(searchStatutesMarked).mockResolvedValueOnce([
      { actId: "BNS", actTitle: "Bharatiya Nyaya Sanhita, 2023", sectionNo: "103", heading: "Murder", snippet: "", snippetMarked: "", text: long, score: 1000, exact: true },
    ]);
    const [s] = await retrieveSources({} as Tx, { question: "s. 103 BNS", documentIds: [], judgmentLimit: 0 });
    expect(s).toMatchObject({ id: "S1", kind: "statute", exact: true });
    expect(s.text.length).toBeLessThanOrEqual(2_400 + 4);
    expect(s.text).toMatch(/section\. \[…\]$/);
  });

  it("respects a zero limit without querying", async () => {
    vi.mocked(searchStatutesMarked).mockClear();
    await retrieveSources({} as Tx, { question: "bail", documentIds: [], statuteLimit: 0, judgmentLimit: 0 });
    expect(searchStatutesMarked).not.toHaveBeenCalled();
  });
});
