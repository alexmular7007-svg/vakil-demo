import { describe, expect, it } from "vitest";
import { clipOrderText, parseOrderProposal, quoteAppearsIn } from "./order-proposal";
import { HearingInput, OrderInput, OutcomeInput, TaskInput } from "./schemas";

describe("parseOrderProposal", () => {
  it("reads a clean JSON reply", () => {
    const p = parseOrderProposal(
      '{"nextDate":"2026-12-15","purpose":"Arguments","court":"Sessions Court","bench":null,"itemNo":"14","caseTitle":null,"caseNo":null,"evidence":"List on 15.12.2026 for arguments."}',
    );
    expect(p).toEqual({
      nextDate: "2026-12-15",
      purpose: "Arguments",
      court: "Sessions Court",
      bench: null,
      itemNo: "14",
      caseTitle: null,
      caseNo: null,
      evidence: "List on 15.12.2026 for arguments.",
    });
  });
  it("tolerates code fences, chatter, numbers and day-first dates", () => {
    const p = parseOrderProposal('Here you go:\n```json\n{"nextDate":"15/12/2026","itemNo":14,"purpose":"  Orders "}\n```');
    expect(p?.nextDate).toBe("2026-12-15");
    expect(p?.itemNo).toBe("14");
    expect(p?.purpose).toBe("Orders");
    expect(p?.court).toBeNull();
  });
  it("drops unreadable dates instead of guessing", () => {
    expect(parseOrderProposal('{"nextDate":"after four weeks"}')?.nextDate).toBeNull();
    expect(parseOrderProposal('{"nextDate":"31.02.2026"}')?.nextDate).toBeNull();
  });
  it("rejects non-JSON replies", () => {
    expect(parseOrderProposal("I could not find a date.")).toBeNull();
    expect(parseOrderProposal("{not json}")).toBeNull();
  });
});

describe("quoteAppearsIn", () => {
  const order = "Heard. Learned counsel for the accused seeks time.\nList on 15.12.2026 for arguments on charge.";
  it("finds quotes despite spacing, case and punctuation", () => {
    expect(quoteAppearsIn(order, "list on 15.12.2026   for arguments")).toBe(true);
    expect(quoteAppearsIn(order, "“List on 15.12.2026 for arguments on charge.”")).toBe(true);
  });
  it("rejects invented or empty quotes", () => {
    expect(quoteAppearsIn(order, "List on 16.12.2026")).toBe(false);
    expect(quoteAppearsIn(order, null)).toBe(false);
    expect(quoteAppearsIn(order, "on")).toBe(false);
  });
});

describe("clipOrderText", () => {
  it("keeps short text and clips long text keeping both ends", () => {
    expect(clipOrderText("  short  ")).toEqual({ text: "short", clipped: false });
    const long = `START${"a".repeat(50_000)}END`;
    const c = clipOrderText(long, 1000);
    expect(c.clipped).toBe(true);
    expect(c.text.startsWith("START")).toBe(true);
    expect(c.text.endsWith("END")).toBe(true);
    expect(c.text.length).toBeLessThan(1100);
  });
});

describe("schemas", () => {
  it("normalises a hearing", () => {
    const v = HearingInput.parse({
      matterId: "",
      caseTitle: "  Sharma v. State ",
      court: "",
      cnr: "dlct-0100-1234-2024",
      hearingDate: "2026-11-04",
      hearingTime: "",
      purpose: "Bail",
    });
    expect(v).toMatchObject({ matterId: null, caseTitle: "Sharma v. State", court: null, cnr: "DLCT010012342024", hearingTime: null, purpose: "Bail", notes: null });
  });
  it("rejects bad hearing input with field paths", () => {
    const r = HearingInput.safeParse({ caseTitle: "x", hearingDate: "2026-02-30", hearingTime: "25:00", cnr: "ABC" });
    expect(r.success).toBe(false);
    const paths = r.error?.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["caseTitle", "hearingDate", "hearingTime", "cnr"]));
  });
  it("validates outcomes and tasks", () => {
    expect(OutcomeInput.safeParse({ id: "8d3f6c1e-6a0e-4c41-9a51-0f1d2b3c4d5e", status: "adjourned", nextDate: "" }).success).toBe(true);
    expect(OutcomeInput.safeParse({ id: "8d3f6c1e-6a0e-4c41-9a51-0f1d2b3c4d5e", status: "scheduled" }).success).toBe(false);
    expect(TaskInput.parse({ title: "File vakalatnama", dueDate: "" })).toMatchObject({ dueDate: null, matterId: null });
  });
  it("needs order text or a document", () => {
    expect(OrderInput.safeParse({ text: "too short" }).success).toBe(false);
    expect(OrderInput.safeParse({ documentId: "8d3f6c1e-6a0e-4c41-9a51-0f1d2b3c4d5e" }).success).toBe(true);
  });
});
