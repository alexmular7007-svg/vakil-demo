import { describe, expect, it } from "vitest";
import { classify, detectActs, detectKind, setClassifierConfig } from "./classify";
import { CLASSIFIER_CONFIG } from "./classify-config";
import type { KnownAct } from "./types";

const known: KnownAct[] = [
  { id: "BNS", shortTitle: "Bharatiya Nyaya Sanhita", tracked: true },
  { id: "BNSS", shortTitle: "Bharatiya Nagarik Suraksha Sanhita", tracked: true },
  { id: "BSA", shortTitle: "Bharatiya Sakshya Adhiniyam", tracked: true },
  { id: "IPC", shortTitle: "Indian Penal Code", tracked: true },
  { id: "CRPC", shortTitle: "Code of Criminal Procedure", tracked: true },
  { id: "IEA", shortTitle: "Indian Evidence Act", tracked: true },
  { id: "NIA", shortTitle: "Negotiable Instruments Act", tracked: true },
  { id: "HMA", shortTitle: "Hindu Marriage Act", tracked: true },
  { id: "CPA", shortTitle: "Consumer Protection Act", tracked: true },
  { id: "RTI", shortTitle: "Right to Information Act", tracked: true },
  { id: "POSH", shortTitle: "Sexual Harassment of Women at Workplace", tracked: true },
];

const entry = (title: string, summary: string | null = null, categories: string[] = []) => ({ title, summary, categories });

describe("detectKind", () => {
  it("recognises legislative wording", () => {
    expect(detectKind("The Bharatiya Nyaya Sanhita (Amendment) Bill, 2026", "", [], "bill")).toBe("bill");
    expect(detectKind("The Criminal Laws (Amendment) Ordinance, 2026", "", [], "bill")).toBe("ordinance");
    expect(detectKind("The Negotiable Instruments (Amendment) Act, 2026", "", [], "act")).toBe("amendment");
    expect(detectKind("The Tribunals Reforms Act, 2026", "", [], "act")).toBe("act");
    expect(detectKind("Code on Wages (Central) Rules, 2026", "", ["Rules"], "bill")).toBe("notification");
    expect(detectKind("S.O. 850(E): commencement of the Bharatiya Nyaya Sanhita", "", [], "act")).toBe("notification");
  });

  it("keeps news as news unless it reports a bill, a notification or a larger-bench ruling", () => {
    expect(detectKind("Karnataka HC enhances wife's maintenance", "", [], "news")).toBe("news");
    expect(detectKind("Lok Sabha passes the Bharatiya Nyaya Sanhita (Amendment) Bill, 2026", "", [], "news")).toBe("bill");
    expect(detectKind("Centre notifies Section 106(2) of BNS, brings it into force", "", [], "news")).toBe("notification");
    expect(detectKind("Supreme Court Constitution Bench holds Section 6A valid", "", [], "news")).toBe("judgment");
    expect(detectKind("Bill of exchange dishonour: Delhi HC explains presentment", "", [], "news")).toBe("news");
  });
});

describe("detectActs", () => {
  it("finds the criminal codes by abbreviation and name, keeping BNS and BNSS apart", () => {
    expect(detectActs("Section 103 BNS and Section 480 BNSS", known)).toEqual(["BNS", "BNSS"]);
    expect(detectActs("Bharatiya Nagarik Suraksha Sanhita (Amendment) Bill", known)).toEqual(["BNSS"]);
    expect(detectActs("Quashing under Section 482 CrPC; offences under IPC 498A", known)).toEqual(["CRPC", "IPC"]);
    expect(detectActs("Cheque bounce under the NI Act", known)).toEqual(["NIA"]);
  });

  it("does not mistake the Bankers' Books Evidence Act for the Indian Evidence Act", () => {
    expect(detectActs("The Bankers' Books Evidence Act, 1891 amended", known)).toEqual([]);
    expect(detectActs("Section 65B of the Evidence Act", known)).toEqual(["IEA"]);
  });

  it("matches tracked acts added by an admin by their short title", () => {
    expect(detectActs("Amendment to the Sexual Harassment of Women at Workplace law", known)).toEqual(["POSH"]);
  });
});

describe("classify importance", () => {
  it("marks bills and acts touching criminal law, tracked acts, the Constitution or courts as high", () => {
    expect(classify(entry("The Bharatiya Nyaya Sanhita (Amendment) Bill, 2026"), "bill", known)).toMatchObject({ kind: "bill", importance: "high", acts: ["BNS"] });
    expect(classify(entry("The Criminal Laws (Amendment) Ordinance, 2026"), "bill", known)).toMatchObject({ kind: "ordinance", importance: "high" });
    expect(classify(entry("The Negotiable Instruments (Amendment) Act, 2026"), "act", known)).toMatchObject({ kind: "amendment", importance: "high", acts: ["NIA"] });
    expect(classify(entry("The Constitution (One Hundred and Thirty-First Amendment) Bill, 2026"), "bill", known).importance).toBe("high");
    expect(classify(entry("The Supreme Court (Number of Judges) Amendment Bill, 2026"), "bill", known).importance).toBe("high");
  });

  it("leaves unrelated legislation normal, whatever its summary says", () => {
    const r = classify(entry("The Kerala (Alteration of Name) Bill, 2026", "Government bill introduced in Lok Sabha. Status: Passed."), "bill", known);
    expect(r).toMatchObject({ kind: "bill", importance: "normal", acts: [] });
    expect(classify(entry("The Appropriation (No. 3) Act, 2026"), "act", known).importance).toBe("normal");
  });

  it("marks a notification high only when it touches a tracked act", () => {
    expect(classify(entry("Notification: commencement of section 106(2) of the Bharatiya Nyaya Sanhita"), "act", known).importance).toBe("high");
    expect(classify(entry("Code on Wages (Central) Rules, 2026", null, ["Rules"]), "bill", known).importance).toBe("normal");
  });

  it("marks Supreme Court constitution-bench rulings on the codes high, ordinary judgments normal", () => {
    const landmark = classify(entry("Supreme Court Constitution Bench rules on Section 498A IPC and BNS 85"), "news", known);
    expect(landmark).toMatchObject({ kind: "judgment", importance: "high" });
    expect(landmark.tags).toEqual(expect.arrayContaining(["supreme-court", "larger-bench", "criminal-law"]));

    // An excerpt that merely cites an earlier constitution bench does not count.
    const routine = classify(
      entry("Piyush vs State Of Maharashtra on 2 November, 2026", "Leave granted. As held by the Constitution Bench in Lalita Kumari, Section 482 CrPC...", ["Supreme Court"]),
      "judgment",
      known,
    );
    expect(routine).toMatchObject({ kind: "judgment", importance: "normal", acts: ["CRPC"] });

    expect(classify(entry("Delhi High Court full bench on NI Act presumption"), "news", known).importance).toBe("normal");
  });

  it("keeps ordinary news normal", () => {
    expect(classify(entry("Shardul Amarchand Mangaldas advises on IPO"), "news", known)).toMatchObject({ kind: "news", importance: "normal", acts: [] });
  });
});

describe("classifier configuration", () => {
  it("tags High Court reports in any case", () => {
    expect(classify(entry("Delhi High Court grants bail under the NDPS Act"), "news", known).tags).toContain("high-court");
    expect(classify(entry("Karnataka HC on maintenance"), "news", known).tags).toContain("high-court");
  });

  it("takes new subjects and act names from the one config object", () => {
    const base = CLASSIFIER_CONFIG;
    const prev = setClassifierConfig({
      ...base,
      subjects: { ...base.subjects, criminal: [...base.subjects.criminal, "cyber fraud"] },
      actAliases: { POSH: ["posh act"] },
    });
    try {
      expect(classify(entry("The Cyber Fraud Prevention Bill, 2026"), "bill", known)).toMatchObject({ kind: "bill", importance: "high" });
      expect(detectActs("Inquiry under the POSH Act", known)).toEqual(["POSH"]);
    } finally {
      setClassifierConfig(prev);
    }
    expect(classify(entry("The Cyber Fraud Prevention Bill, 2026"), "bill", known).importance).toBe("normal");
    expect(detectActs("Inquiry under the POSH Act", known)).toEqual([]);
  });
});
