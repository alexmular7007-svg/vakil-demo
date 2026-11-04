import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/corpus/search", () => ({
  getSection: vi.fn(async (act: string, sec: string) => {
    if (act === "BNS" && sec === "103") {
      return { actId: "BNS", actTitle: "Bharatiya Nyaya Sanhita, 2023", sectionNo: "103", heading: "Punishment for murder", snippet: "", text: "", score: 1 };
    }
    return null;
  }),
}));

const ARNESH = {
  id: "11111111-1111-4111-8111-111111111111",
  court: "Supreme Court of India",
  title: "Arnesh Kumar v. State of Bihar",
  decidedOn: "2014-07-02",
  citation: "(2014) 8 SCC 273",
  caseNo: null,
  bench: null,
};

vi.mock("@/lib/judgments/queries", () => ({
  findJudgmentsForRefs: vi.fn(async (refs: { citations: string[]; names: { text: string; first: string }[] }) => {
    const m = new Map();
    for (const c of refs.citations) if (c.replace(/\W/g, "") === "20148SCC273") m.set(c, ARNESH);
    for (const n of refs.names) if (n.first === "arnesh kumar") m.set(n.text, ARNESH);
    return m;
  }),
}));

import { verifyCitations } from "./citations";
import type { Source } from "./retrieval";

const sources: Source[] = [
  {
    id: "S1",
    kind: "statute",
    label: "Bharatiya Nyaya Sanhita, 2023, Section 105: Punishment for culpable homicide",
    text: "…",
    href: "/app/research/BNS/105",
    meta: { actId: "BNS", sectionNo: "105" },
  },
];

describe("verifyCitations", () => {
  it("marks retrieved [S#] markers as verified and unknown ones as invalid", async () => {
    const c = await verifyCitations("Punishable under BNS s.105 [S1]. Also see [S4].", sources);
    expect(c.find((x) => x.id === "S1")?.status).toBe("verified");
    expect(c.find((x) => x.id === "S4")?.status).toBe("invalid");
  });

  it("checks statute references written in prose against the corpus", async () => {
    const c = await verifyCitations("Murder is punishable under Section 103 of the Bharatiya Nyaya Sanhita, unlike s. 999 IPC.", []);
    expect(c.find((x) => x.label.includes("Punishment for murder"))?.status).toBe("in_corpus");
    expect(c.find((x) => x.label.startsWith("IPC s.999"))?.status).toBe("not_in_corpus");
  });

  it("does not re-check a section that was already retrieved", async () => {
    const c = await verifyCitations("Under BNS s.105 [S1] the punishment is…", sources);
    expect(c).toHaveLength(1);
  });

  it("flags case names and citations missing from the judgments library as unverified", async () => {
    const c = await verifyCitations("See Lalita Kumari v. Govt. of U.P., (2014) 2 SCC 1.", []);
    const cases = c.filter((x) => x.kind === "case");
    expect(cases.map((x) => x.label)).toEqual(["(2014) 2 SCC 1", "Lalita Kumari v. Govt. of U.P."]);
    expect(cases.every((x) => x.status === "unverified")).toBe(true);
  });

  it("marks a case found in the library as verified in library, once, with a link", async () => {
    const c = await verifyCitations("See Arnesh Kumar v. State of Bihar, (2014) 8 SCC 273, para 11.", []);
    const cases = c.filter((x) => x.kind === "case");
    expect(cases).toEqual([
      {
        id: "ref-1",
        kind: "case",
        label: "Arnesh Kumar v. State of Bihar (Supreme Court of India, decided 2 Jul 2014), (2014) 8 SCC 273",
        href: `/app/research/case/${ARNESH.id}`,
        status: "in_library",
      },
    ]);
  });

  it("does not repeat a judgment that was already cited as a source", async () => {
    const judgmentSource: Source = {
      id: "S2",
      kind: "judgment",
      label: "Arnesh Kumar v. State of Bihar …, para 11",
      text: "…",
      href: `/app/research/case/${ARNESH.id}#para-11`,
      meta: { judgmentId: ARNESH.id, paraNo: 11 },
    };
    const c = await verifyCitations("In Arnesh Kumar v. State of Bihar (para 11) [S2] the Court…", [...sources, judgmentSource]);
    expect(c.map((x) => [x.id, x.status])).toEqual([["S2", "verified"]]);
  });
});
