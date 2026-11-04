import { describe, expect, it } from "vitest";
import { computeChequeBounce, type ChequeInput } from "./cheque-bounce";

function ok(input: ChequeInput) {
  const r = computeChequeBounce(input);
  if (!r.ok) throw new Error(`Expected a result, got errors: ${r.errors.join(" ")}`);
  return r;
}
const stage = (r: ReturnType<typeof ok>, key: string) => r.stages.find((s) => s.key === key)!;

describe("Saketh India Ltd v India Securities Ltd (SC, 1999)", () => {
  it("reproduces the Supreme Court's dates", () => {
    // Notice served 29.9.1995; 15 days expired 14.10.1995; cause of action 15.10.1995; complaint on 15.11.1995 within time.
    const r = ok({ chequeDate: "1995-03-15", noticeServedOn: "1995-09-29", complaintFiledOn: "1995-11-15" });
    expect(r.paymentDeadline).toBe("1995-10-14");
    expect(r.causeOfAction).toBe("1995-10-15");
    expect(r.complaintDeadline).toBe("1995-11-15");
    expect(stage(r, "complaint").state).toBe("ok");
  });
});

describe("proviso (a): presentation within six months or validity, whichever is earlier", () => {
  it("uses the RBI three-month validity for cheques dated from 1 April 2012", () => {
    const r = ok({ chequeDate: "2026-01-15" });
    expect(r.validity).toMatchObject({ months: 3, source: "rbi", validityEnd: "2026-04-15", sixMonthEnd: "2026-07-15", lastPresentation: "2026-04-15" });
    expect(ok({ chequeDate: "2012-04-01" }).validity).toMatchObject({ source: "rbi", lastPresentation: "2012-07-01" });
  });

  it("uses six months for cheques dated before 1 April 2012", () => {
    expect(ok({ chequeDate: "2012-03-31" }).validity).toMatchObject({ months: 6, source: "pre-2012", lastPresentation: "2012-09-30" });
  });

  it("uses a shorter validity printed on the cheque, with month-end clamping", () => {
    expect(ok({ chequeDate: "2026-01-31", validityMonths: 1 }).validity).toMatchObject({ source: "cheque", lastPresentation: "2026-02-28" });
    // A longer printed validity never beats the statutory six months.
    expect(ok({ chequeDate: "2026-01-15", validityMonths: 6 }).validity.lastPresentation).toBe("2026-07-15");
  });

  it("classifies the presentation date", () => {
    expect(stage(ok({ chequeDate: "2026-01-15", presentedOn: "2026-04-14" }), "presentation").state).toBe("ok");
    expect(stage(ok({ chequeDate: "2026-01-15", presentedOn: "2026-04-15" }), "presentation").state).toBe("boundary");
    const late = ok({ chequeDate: "2026-01-15", presentedOn: "2026-04-16" });
    expect(stage(late, "presentation").state).toBe("late");
    expect(late.notes.some((n) => n.title === "Presented after validity")).toBe(true);
  });

  it("does not call validity over when later events show the cheque was presented", () => {
    const r = ok({ chequeDate: "2026-08-01", infoReceivedOn: "2026-10-10", noticeServedOn: "2026-10-20", today: "2026-11-03" });
    expect(stage(r, "presentation")).toMatchObject({ state: "unknown", label: "Date not entered", deadline: "2026-11-01" });
    expect(stage(ok({ chequeDate: "2026-08-01", today: "2026-11-03" }), "presentation")).toMatchObject({ state: "late", label: "Validity over" });
  });

  it("rejects presentation before the cheque date and bad validity", () => {
    expect(computeChequeBounce({ chequeDate: "2026-01-15", presentedOn: "2026-01-14" })).toMatchObject({ ok: false });
    expect(computeChequeBounce({ chequeDate: "2026-01-15", validityMonths: 7 })).toMatchObject({ ok: false });
    expect(computeChequeBounce({ chequeDate: "2026-01-15", validityMonths: 0 })).toMatchObject({ ok: false });
    expect(computeChequeBounce({ chequeDate: "" })).toMatchObject({ ok: false });
    expect(computeChequeBounce({ chequeDate: "2026-02-30" })).toMatchObject({ ok: false });
  });
});

describe("proviso (b): notice within 30 days of the bank's information", () => {
  const base = { chequeDate: "2026-03-01", presentedOn: "2026-04-25", infoReceivedOn: "2026-05-01" };

  it("computes the deadline excluding the day of receipt", () => {
    expect(ok(base).noticeDeadline).toBe("2026-05-31");
  });

  it("accepts a notice on the 30th day and flags the 31st", () => {
    expect(stage(ok({ ...base, noticeSentOn: "2026-05-31" }), "notice").state).toBe("ok");
    const late = ok({ ...base, noticeSentOn: "2026-06-01" });
    expect(stage(late, "notice").state).toBe("late");
    expect(late.notes.some((n) => n.title === "Notice outside 30 days")).toBe(true);
  });

  it("counts down when the notice is not yet sent", () => {
    const r = ok({ ...base, today: "2026-05-21" });
    expect(stage(r, "notice")).toMatchObject({ state: "pending", daysLeft: 10, label: "10 days left" });
    expect(r.headline).toMatchObject({ label: "Last day to send the demand notice", date: "2026-05-31", daysLeft: 10 });
    expect(stage(ok({ ...base, today: "2026-06-02" }), "notice")).toMatchObject({ state: "late", label: "Deadline passed" });
  });

  it("rejects events out of order", () => {
    expect(computeChequeBounce({ ...base, infoReceivedOn: "2026-04-20" })).toMatchObject({ ok: false });
    expect(computeChequeBounce({ ...base, noticeSentOn: "2026-04-30" })).toMatchObject({ ok: false });
    expect(computeChequeBounce({ ...base, noticeSentOn: "2026-05-05", noticeServedOn: "2026-05-04" })).toMatchObject({ ok: false });
  });
});

describe("proviso (c) and s. 142(1)(b): 15 days to pay, then one month to file", () => {
  const base = { chequeDate: "2026-03-01", presentedOn: "2026-04-25", infoReceivedOn: "2026-05-01", noticeSentOn: "2026-05-28", noticeServedOn: "2026-06-05" };

  it("computes the whole chain", () => {
    const r = ok(base);
    expect(r.paymentDeadline).toBe("2026-06-20");
    expect(r.causeOfAction).toBe("2026-06-21");
    expect(r.complaintDeadline).toBe("2026-07-21");
    expect(r.headline).toMatchObject({ label: "Last day to file the complaint", date: "2026-07-21" });
    expect(r.stages.map((s) => s.key)).toEqual(["presentation", "notice", "payment", "complaint"]);
  });

  it("shows the payment window running, then over", () => {
    expect(stage(ok({ ...base, today: "2026-06-20" }), "payment")).toMatchObject({ state: "waiting", label: "Running" });
    expect(stage(ok({ ...base, today: "2026-06-21" }), "payment")).toMatchObject({ state: "ok", label: "Over" });
  });

  it("tells you not to file before the cause of action", () => {
    const s = stage(ok({ ...base, today: "2026-06-10" }), "complaint");
    expect(s.label).toBe("Opens 21 Jun 2026");
    expect(s.detail).toContain("File between 21 Jun 2026 and");
  });

  it("classifies a filed complaint", () => {
    expect(stage(ok({ ...base, complaintFiledOn: "2026-06-20" }), "complaint").state).toBe("premature");
    expect(stage(ok({ ...base, complaintFiledOn: "2026-06-21" }), "complaint").state).toBe("ok");
    expect(stage(ok({ ...base, complaintFiledOn: "2026-07-21" }), "complaint").state).toBe("ok");
    const late = ok({ ...base, complaintFiledOn: "2026-07-22" });
    expect(stage(late, "complaint")).toMatchObject({ state: "late", label: "Late: needs condonation" });
  });

  it("counts days left to file and flags a missed deadline", () => {
    expect(stage(ok({ ...base, today: "2026-07-14" }), "complaint")).toMatchObject({ state: "pending", daysLeft: 7 });
    expect(stage(ok({ ...base, today: "2026-07-25" }), "complaint")).toMatchObject({ state: "late", daysLeft: -4 });
  });

  it("clamps a cause of action on the 31st to the end of the next month", () => {
    // Served 15 Jan; cause of action 31 Jan; one month ends 28 Feb (29 Feb in a leap year).
    const r = ok({ chequeDate: "2025-12-01", noticeServedOn: "2026-01-15" });
    expect(r.causeOfAction).toBe("2026-01-31");
    expect(r.complaintDeadline).toBe("2026-02-28");
    expect(r.complaintClamped).toBe(true);
    expect(r.notes.some((n) => n.title === "Month-end date")).toBe(true);
    expect(ok({ chequeDate: "2027-12-01", noticeServedOn: "2028-01-15" }).complaintDeadline).toBe("2028-02-29");
  });

  it("does not clamp when the corresponding date exists", () => {
    // Cause of action 28 Feb 2026 -> 28 Mar 2026 (corresponding date, not the end of March).
    const r = ok({ chequeDate: "2025-12-01", noticeServedOn: "2026-02-12" });
    expect(r.causeOfAction).toBe("2026-02-28");
    expect(r.complaintDeadline).toBe("2026-03-28");
    expect(r.complaintClamped).toBe(false);
  });

  it("crosses a year end", () => {
    const r = ok({ chequeDate: "2026-09-01", noticeServedOn: "2026-12-20" });
    expect(r.paymentDeadline).toBe("2027-01-04");
    expect(r.causeOfAction).toBe("2027-01-05");
    expect(r.complaintDeadline).toBe("2027-02-05");
  });
});

describe("headline and notes", () => {
  it("picks the next relevant deadline", () => {
    expect(ok({ chequeDate: "2026-01-15" }).headline).toMatchObject({ label: "Last day to present the cheque", date: "2026-04-15" });
    expect(ok({ chequeDate: "2026-01-15", presentedOn: "2026-02-01" }).headline).toMatchObject({ label: "Cheque presented" });
    expect(ok({ chequeDate: "2026-01-15", presentedOn: "2026-02-01", infoReceivedOn: "2026-02-03", noticeSentOn: "2026-02-10" }).headline).toMatchObject({
      label: "Demand notice",
      date: "2026-02-10",
    });
  });

  it("always notes the s. 142 proviso, service of notice and jurisdiction", () => {
    const titles = ok({ chequeDate: "2026-01-15" }).notes.map((n) => n.title);
    expect(titles).toEqual(expect.arrayContaining(["Late complaints", "Date of service of notice", "How the days are counted", "Where to file"]));
  });

  it("marks stages it cannot compute yet", () => {
    const r = ok({ chequeDate: "2026-01-15" });
    expect(stage(r, "notice").state).toBe("unknown");
    expect(stage(r, "payment").state).toBe("unknown");
    expect(stage(r, "complaint").state).toBe("unknown");
  });
});
