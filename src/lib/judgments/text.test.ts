import { describe, expect, it } from "vitest";
import { guessJudgmentMeta, splitJudgmentParas, stripPageFurniture, titleCase, unwrapLines } from "./text";

// Shaped like text extracted from a reported Supreme Court PDF: one block per page,
// a running header on every page, the judgment's own paragraph numbers.
const SC = [
  [
    "[2024] 10 S.C.R. 108 : 2024 INSC 735",
    "Ramesh Kumar",
    "v.",
    "The State of Bihar",
    "(Criminal Appeal No. 1031 of 2015)",
    "25 September 2024",
    "[Bela M. Trivedi and Satish Chandra Sharma,* JJ.]",
    "Issue for Consideration",
    "Whether the High Court could reverse an acquittal.",
  ].join("\n"),
  [
    "[2024] 10 S.C.R. 109Ramesh Kumar v. The State of Bihar",
    "Judgment",
    "Satish Chandra Sharma, J.",
    "1. On 30.08.1985, the deceased was found dead. The factum of her death was",
    "discovered in furtherance of the written report lodged by the brother-",
    "in-law of the deceased.",
    "2. The Trial Court charged all seven accused persons.",
  ].join("\n"),
  [
    "110 [2024] 10 S.C.R.Digital Supreme Court Reports",
    "3. The High Court reversed the acquittal of two accused, holding that",
    "(i) the chain of circumstances was complete; and",
    "(ii) the motive was proved.",
    "4. We have heard learned counsel.",
  ].join("\n"),
  [
    "[2024] 10 S.C.R. 111Ramesh Kumar v. The State of Bihar",
    "5. The appeals are allowed.",
  ].join("\n"),
  [
    "112 [2024] 10 S.C.R.Digital Supreme Court Reports",
    "6. No costs.",
    "Result of the Case: Appeals allowed.",
    "†Headnotes prepared by: A. Editor",
  ].join("\n"),
].join("\n\n");

describe("stripPageFurniture", () => {
  it("drops running headers that repeat on several pages, and page numbers", () => {
    const out = stripPageFurniture(SC);
    expect(out).not.toMatch(/S\.C\.R\. 109Ramesh/);
    expect(out).not.toMatch(/Digital Supreme Court Reports/);
    expect(out).not.toMatch(/Headnotes prepared by/);
    // The first page's citation line appears once, so it stays.
    expect(out).toMatch(/\[2024\] 10 S\.C\.R\. 108 : 2024 INSC 735/);
  });

  it("removes page numbers and signature stamps but keeps numbered paragraphs", () => {
    const text = "1. First para text.\n- 2 -\n\nPage 3 of 9\n2. Second para.\nSignature Not Verified\nDigitally signed by X";
    const out = stripPageFurniture(text);
    expect(out).toContain("1. First para text.");
    expect(out).toContain("2. Second para.");
    expect(out).not.toMatch(/Page 3 of 9|- 2 -|Signature|Digitally/);
  });

  it("does not treat repeated numbered paragraph openings as headers", () => {
    const docx = "1. Heard learned counsel.\n\n2. Heard learned counsel.\n\n3. Heard learned counsel.";
    expect(stripPageFurniture(docx).split("\n\n")).toHaveLength(3);
  });
});

describe("splitJudgmentParas", () => {
  it("keeps the judgment's own numbering and puts the cause title in paragraph 0", () => {
    const { paras, mode } = splitJudgmentParas(SC);
    expect(mode).toBe("numbered");
    expect(paras.map((p) => p.paraNo)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(paras[0].text).toMatch(/^\[2024\] 10 S\.C\.R\. 108/);
    expect(paras[1].text).toBe(
      "On 30.08.1985, the deceased was found dead. The factum of her death was discovered in furtherance of the written report lodged by the brother-in-law of the deceased.",
    );
    expect(paras[3].text).toContain("\n(i) the chain of circumstances was complete; and\n(ii) the motive was proved.");
    expect(paras[5].text).toBe("The appeals are allowed.");
    expect(paras[6].text).toBe("No costs. Result of the Case: Appeals allowed.");
  });

  it("takes an unnumbered first paragraph after the author line as paragraph 1", () => {
    const text = [
      "Appearances for Parties",
      "A. Advocate for the Appellant.",
      "Judgment",
      "Sanjiv Khanna, J.",
      "This judgment decides two sets of appeals, one by the State",
      "and the other by the widow of the deceased.",
      "2. The facts are these.",
      "3. The appeals are allowed.",
    ].join("\n");
    const { paras } = splitJudgmentParas(text);
    expect(paras.map((p) => p.paraNo)).toEqual([0, 1, 2, 3]);
    expect(paras[0].text).toBe("Appearances for Parties A. Advocate for the Appellant. Judgment Sanjiv Khanna, J.");
    expect(paras[1].text).toBe("This judgment decides two sets of appeals, one by the State and the other by the widow of the deceased.");
  });

  it("allows small gaps in the numbering and ignores lists that restart inside a paragraph", () => {
    const text = [
      "1. Facts.",
      "2. The questions are:",
      "1. whether the notice was valid;",
      "2. whether the suit was barred.",
      "4. Paragraph 3 was lost in extraction.",
      "5. Conclusion.",
    ].join("\n");
    const { paras } = splitJudgmentParas(text);
    expect(paras.map((p) => p.paraNo)).toEqual([1, 2, 4, 5]);
    expect(paras[1].text).toContain("1. whether the notice was valid;");
  });

  it("continues numbering for a separate opinion that restarts at 1", () => {
    const text = [
      "1. a",
      "2. b",
      "3. c",
      "4. d",
      "5. e",
      "R. SUBHASH REDDY, J.",
      "1. I agree with my learned brother.",
      "2. I add a few words.",
    ].join("\n");
    const { paras } = splitJudgmentParas(text.replace(/\. ([a-e])$/gm, ". Paragraph $1 text."));
    expect(paras.map((p) => p.paraNo)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(paras[5].text).toBe("1. I agree with my learned brother.");
  });

  it("splits unnumbered text on blank lines and joins sentences broken by a page", () => {
    const text = "ORDER\n\nHeard the parties at length on the\n\nquestion of bail.\n\nThe application is allowed.";
    const { paras, mode } = splitJudgmentParas(text);
    expect(mode).toBe("blocks");
    expect(paras).toEqual([
      { paraNo: 1, text: "ORDER" },
      { paraNo: 2, text: "Heard the parties at length on the question of bail." },
      { paraNo: 3, text: "The application is allowed." },
    ]);
  });

  it("splits a long unbroken block at sentence ends", () => {
    const sentence = "The court considered the evidence on record in great detail and found it wanting. ";
    const { paras } = splitJudgmentParas(sentence.repeat(200));
    expect(paras.length).toBeGreaterThan(3);
    expect(paras.every((p) => p.text.length <= 6000)).toBe(true);
    expect(paras.every((p) => p.text.endsWith("wanting."))).toBe(true);
  });

  it("returns nothing for empty input", () => {
    expect(splitJudgmentParas("   \n\n ").paras).toEqual([]);
  });
});

describe("unwrapLines", () => {
  it("joins wrapped lines and keeps list items on their own lines", () => {
    expect(unwrapLines(["The accused", "was arrested.", "(a) first;", "(b) second."])).toBe("The accused was arrested.\n(a) first;\n(b) second.");
  });
});

describe("guessJudgmentMeta", () => {
  it("reads citation, court, date, title, case number and bench from a Supreme Court first page", () => {
    const m = guessJudgmentMeta(SC);
    expect(m.court).toBe("Supreme Court of India");
    expect(m.citation).toBe("2024 INSC 735; [2024] 10 S.C.R. 108");
    expect(m.decidedOn).toBe("2024-09-25");
    expect(m.title).toBe("Ramesh Kumar v. The State of Bihar");
    expect(m.caseNo).toBe("Criminal Appeal No. 1031 of 2015");
    expect(m.bench).toBe("Bela M. Trivedi, Satish Chandra Sharma");
  });

  it("reads a High Court order header", () => {
    const text = [
      "IN THE HIGH COURT OF JUDICATURE AT BOMBAY,",
      "BENCH AT AURANGABAD.",
      "APPLICATION FOR CANCELLATION OF BAIL NO. 1 OF 2024",
      "THE STATE OF MAHARASHTRA",
      "VERSUS",
      "GANESH KUMAR",
      "CORAM : SHIVKUMAR DIGE, J.",
      "DATE : 6th September, 2024.",
    ].join("\n");
    const m = guessJudgmentMeta(text);
    expect(m.court).toBe("Bombay High Court");
    expect(m.title).toBe("The State of Maharashtra v. Ganesh Kumar");
    expect(m.decidedOn).toBe("2024-09-06");
    expect(m.bench).toBe("SHIVKUMAR DIGE");
  });

  it("rejects impossible dates", () => {
    expect(guessJudgmentMeta("Dated: 31.02.2024").decidedOn).toBeUndefined();
  });
});

describe("titleCase", () => {
  it("keeps small words lower case except at the start", () => {
    expect(titleCase("OF OFFENCES AGAINST THE STATE")).toBe("Of Offences against the State");
  });
});
