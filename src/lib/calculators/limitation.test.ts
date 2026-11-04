import { describe, expect, it } from "vitest";
import { computeLimitation, SPECIAL_LAW_DISCLAIMER, type LimitationInput } from "./limitation";
import { getLimitationArticle, LIMITATION_ARTICLES } from "./limitation-articles";

function ok(input: LimitationInput) {
  const r = computeLimitation(input);
  if (!r.ok) throw new Error(`Expected a result, got errors: ${r.errors.join(" ")}`);
  return r;
}

const SUN_ONLY = { sundays: true, saturdays: false, ranges: [] };

describe("article table (Schedule, India Code)", () => {
  it("has unique ids and complete statute fields", () => {
    const ids = LIMITATION_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of LIMITATION_ARTICLES) {
      expect(a.description.length, a.id).toBeGreaterThan(10);
      expect(a.runsFrom.length, a.id).toBeGreaterThan(5);
      expect(a.periodText, a.id).toMatch(/^(Thirty|Sixty|Ninety) days\.$|^(Three|Twelve) years\.$/);
      expect(a.period.amount, a.id).toBeGreaterThan(0);
    }
  });

  it("keeps the period number in step with the statute words", () => {
    const words: Record<string, number> = { Thirty: 30, Sixty: 60, Ninety: 90, Three: 3, Twelve: 12 };
    for (const a of LIMITATION_ARTICLES) {
      const [w, unit] = a.periodText.replace(".", "").split(" ");
      expect(a.period.amount, a.id).toBe(words[w]);
      expect(a.period.unit, a.id).toBe(unit);
    }
  });

  it("allows copy exclusion only for appeals, leave, revision and review, all counted in days", () => {
    for (const a of LIMITATION_ARTICLES.filter((x) => x.copyExclusion)) {
      expect(a.period.unit, a.id).toBe("days");
      expect(a.kind === "appeal" || ["124", "131", "133a", "133b", "133c"].includes(a.id), a.id).toBe(true);
    }
    expect(LIMITATION_ARTICLES.filter((a) => a.kind === "appeal").every((a) => a.copyExclusion)).toBe(true);
  });

  it("carries the verified periods for key articles", () => {
    const p = (id: string) => getLimitationArticle(id)!.period;
    expect(p("19")).toEqual({ amount: 3, unit: "years" });
    expect(p("65")).toEqual({ amount: 12, unit: "years" });
    expect(p("116a")).toEqual({ amount: 90, unit: "days" });
    expect(p("116b")).toEqual({ amount: 30, unit: "days" });
    expect(p("117")).toEqual({ amount: 30, unit: "days" });
    expect(p("115b1")).toEqual({ amount: 60, unit: "days" });
    expect(p("121")).toEqual({ amount: 60, unit: "days" });
    expect(p("127")).toEqual({ amount: 60, unit: "days" });
    expect(p("131")).toEqual({ amount: 90, unit: "days" });
    expect(p("136")).toEqual({ amount: 12, unit: "years" });
    expect(p("137")).toEqual({ amount: 3, unit: "years" });
  });
});

describe("s. 12(1): the first day is excluded", () => {
  it("30-day appeal from a decree of 1 Jan ends on 31 Jan", () => {
    const r = ok({ articleId: "116b", startDate: "2026-01-01" });
    expect(r.countFrom).toBe("2026-01-02");
    expect(r.periodEnd).toBe("2026-01-31");
    expect(r.lastDate).toBe("2026-01-31");
  });

  it("90-day appeal to the High Court", () => {
    expect(ok({ articleId: "116a", startDate: "2025-11-15" }).lastDate).toBe("2026-02-13");
  });

  it("three-year suit ends on the corresponding date", () => {
    const r = ok({ articleId: "19", startDate: "2023-03-10" });
    expect(r.lastDate).toBe("2026-03-10");
    expect(r.steps.some((s) => s.cite?.includes("General Clauses Act"))).toBe(true);
  });

  it("twelve-year suit for possession", () => {
    expect(ok({ articleId: "65", startDate: "2014-06-30" }).lastDate).toBe("2026-06-30");
  });

  it("a period from 29 February ends on 28 February and is flagged", () => {
    const r = ok({ articleId: "19", startDate: "2024-02-29" });
    expect(r.lastDate).toBe("2027-02-28");
    expect(r.notes.some((n) => n.title === "Month-end date")).toBe(true);
  });

  it("a period crossing a leap day counts it", () => {
    // 30 days from 15 Feb 2024 (leap year): 16 Feb .. 16 Mar.
    expect(ok({ articleId: "116b", startDate: "2024-02-15" }).lastDate).toBe("2024-03-16");
    expect(ok({ articleId: "116b", startDate: "2025-02-15" }).lastDate).toBe("2025-03-17");
  });
});

describe("s. 12(2), (3): certified-copy time", () => {
  it("excludes the days from application to readiness, both counted", () => {
    const r = ok({ articleId: "116b", startDate: "2026-01-01", copyAppliedOn: "2026-01-10", copyReadyOn: "2026-01-20" });
    expect(r.copyDaysExcluded).toBe(11);
    expect(r.prescribedEnd).toBe("2026-02-11");
    expect(r.lastDate).toBe("2026-02-11");
  });

  it("does not double-count the judgment day when the copy is applied for the same day", () => {
    const r = ok({ articleId: "116b", startDate: "2026-01-01", copyAppliedOn: "2026-01-01", copyReadyOn: "2026-01-05" });
    expect(r.copyDaysExcluded).toBe(4); // 2 to 5 Jan
    expect(r.prescribedEnd).toBe("2026-02-04");
  });

  it("a copy ready the same day it was applied for on the judgment day excludes nothing extra", () => {
    const r = ok({ articleId: "116b", startDate: "2026-01-01", copyAppliedOn: "2026-01-01", copyReadyOn: "2026-01-01" });
    expect(r.copyDaysExcluded).toBe(0);
    expect(r.prescribedEnd).toBe("2026-01-31");
  });

  it("a copy applied for on the last day still extends the period", () => {
    const r = ok({ articleId: "116b", startDate: "2026-01-01", copyAppliedOn: "2026-01-31", copyReadyOn: "2026-02-03" });
    expect(r.copyDaysExcluded).toBe(4);
    expect(r.prescribedEnd).toBe("2026-02-04");
  });

  it("a copy applied for after the period ended does not extend it", () => {
    const r = ok({ articleId: "116b", startDate: "2026-01-01", copyAppliedOn: "2026-02-01", copyReadyOn: "2026-02-10" });
    expect(r.copyDaysExcluded).toBe(0);
    expect(r.prescribedEnd).toBe("2026-01-31");
    expect(r.notes.some((n) => n.tone === "danger" && n.title.includes("after the period ended"))).toBe(true);
  });

  it("applies to revision and review as well as appeals", () => {
    expect(ok({ articleId: "131", startDate: "2026-01-01", copyAppliedOn: "2026-01-05", copyReadyOn: "2026-01-14" }).prescribedEnd).toBe("2026-04-11");
    expect(ok({ articleId: "124", startDate: "2026-03-02", copyAppliedOn: "2026-03-03", copyReadyOn: "2026-03-04" }).prescribedEnd).toBe("2026-04-03");
  });

  it("ignores copy dates for suits and other applications", () => {
    const r = ok({ articleId: "19", startDate: "2023-03-10", copyAppliedOn: "2023-03-11", copyReadyOn: "2023-04-11" });
    expect(r.copyDaysExcluded).toBe(0);
    expect(r.lastDate).toBe("2026-03-10");
    expect(ok({ articleId: "122", startDate: "2026-01-01", copyAppliedOn: "2026-01-02", copyReadyOn: "2026-01-09" }).lastDate).toBe("2026-01-31");
  });

  it("validates the copy dates", () => {
    const bad = (copyAppliedOn: string, copyReadyOn: string) => computeLimitation({ articleId: "116b", startDate: "2026-01-10", copyAppliedOn, copyReadyOn });
    expect(bad("2026-01-12", "")).toMatchObject({ ok: false });
    expect(bad("2026-01-12", "2026-01-11")).toMatchObject({ ok: false });
    expect(bad("2026-01-09", "2026-01-11")).toMatchObject({ ok: false });
    expect(bad("2026-01-12", "2040-01-11")).toMatchObject({ ok: false });
  });

  it("reminds about copy time when none is entered for an appeal", () => {
    const r = ok({ articleId: "116a", startDate: "2026-01-01" });
    expect(r.notes.some((n) => n.title === "Certified-copy time")).toBe(true);
  });
});

describe("s. 4: court closed on the last day", () => {
  it("rolls a Saturday-and-Sunday expiry to Monday", () => {
    // 31 Jan 2026 is a Saturday.
    const r = ok({ articleId: "116b", startDate: "2026-01-01", closures: { sundays: true, saturdays: true, ranges: [] } });
    expect(r.prescribedEnd).toBe("2026-01-31");
    expect(r.lastDate).toBe("2026-02-02");
    expect(r.s4?.reopensOn).toBe("2026-02-02");
    expect(r.s4?.closedOn.map((c) => c.date)).toEqual(["2026-01-31", "2026-02-01"]);
  });

  it("leaves a working Saturday alone", () => {
    const r = ok({ articleId: "116b", startDate: "2026-01-01", closures: SUN_ONLY });
    expect(r.lastDate).toBe("2026-01-31");
    expect(r.s4).toBeNull();
  });

  it("skips a vacation and the Sunday after it", () => {
    const r = ok({ articleId: "116b", startDate: "2026-01-01", closures: { sundays: true, saturdays: false, ranges: [{ from: "2026-01-26", to: "2026-01-31" }] } });
    expect(r.lastDate).toBe("2026-02-02"); // 1 Feb is a Sunday
  });

  it("does not move a date when the court is closed only before the last day", () => {
    const r = ok({ articleId: "116b", startDate: "2026-01-01", closures: { sundays: false, saturdays: false, ranges: [{ from: "2026-01-10", to: "2026-01-20" }] } });
    expect(r.lastDate).toBe("2026-01-31");
  });

  it("applies after copy-time exclusion", () => {
    // 116(b) from 1 Jan with 3 copy days (5 to 7 Jan) ends 3 Feb 2026, a Tuesday; close it.
    const r = ok({
      articleId: "116b",
      startDate: "2026-01-01",
      copyAppliedOn: "2026-01-05",
      copyReadyOn: "2026-01-07",
      closures: { sundays: true, saturdays: false, ranges: [{ from: "2026-02-03", to: "2026-02-03" }] },
    });
    expect(r.prescribedEnd).toBe("2026-02-03");
    expect(r.lastDate).toBe("2026-02-04");
  });

  it("always explains s. 4 when no closure is entered", () => {
    const r = ok({ articleId: "116b", startDate: "2026-01-01" });
    expect(r.steps.some((s) => s.cite?.startsWith("s. 4"))).toBe(true);
  });
});

describe("status against today (IST)", () => {
  it("open, soon, today and time-barred", () => {
    const base = { articleId: "116b", startDate: "2026-01-01" };
    expect(ok({ ...base, today: "2026-01-01" })).toMatchObject({ daysLeft: 30, urgency: "open" });
    expect(ok({ ...base, today: "2026-01-26" })).toMatchObject({ daysLeft: 5, urgency: "soon" });
    expect(ok({ ...base, today: "2026-01-31" })).toMatchObject({ daysLeft: 0, urgency: "today" });
    expect(ok({ ...base, today: "2026-02-03" })).toMatchObject({ daysLeft: -3, urgency: "passed" });
    expect(ok(base)).toMatchObject({ daysLeft: null, urgency: null });
  });
});

describe("warnings (notes, not computations)", () => {
  it("suits: no condonation under s. 5, plus s. 14, s. 18 and s. 19 for debts", () => {
    const titles = ok({ articleId: "19", startDate: "2024-01-01" }).notes.map((n) => n.title);
    expect(titles).toContain("No condonation for suits");
    expect(titles).toContain("Time in a court without jurisdiction");
    expect(titles).toContain("Acknowledgment in writing");
    expect(titles).toContain("Part payment");
  });

  it("non-debt suits do not mention part payment", () => {
    expect(ok({ articleId: "65", startDate: "2020-01-01" }).notes.map((n) => n.title)).not.toContain("Part payment");
  });

  it("appeals: s. 5 condonation is available", () => {
    const notes = ok({ articleId: "116a", startDate: "2026-01-01", today: "2026-06-01" }).notes;
    const s5 = notes.find((n) => n.title === "Condonation of delay");
    expect(s5?.tone).toBe("danger");
    expect(notes.map((n) => n.title)).not.toContain("Time in a court without jurisdiction");
  });

  it("execution: Order XXI applications are outside s. 5", () => {
    const titles = ok({ articleId: "136", startDate: "2010-01-01" }).notes.map((n) => n.title);
    expect(titles).toContain("Condonation not available under Order XXI");
    expect(titles).not.toContain("Condonation of delay");
  });

  it("always carries the special-law disclaimer", () => {
    for (const a of LIMITATION_ARTICLES) {
      const r = ok({ articleId: a.id, startDate: "2025-06-15" });
      expect(r.disclaimer).toBe("Special laws may prescribe different periods; verify before filing.");
      expect(r.disclaimer).toBe(SPECIAL_LAW_DISCLAIMER);
      expect(r.notes.some((n) => n.cite?.includes("29(2)"))).toBe(true);
    }
  });

  it("flags the CrPC 1898 references in Arts. 114 and 115", () => {
    expect(ok({ articleId: "115b1", startDate: "2026-01-01" }).notes.some((n) => n.body.includes("1898"))).toBe(true);
    expect(ok({ articleId: "114a", startDate: "2026-01-01" }).notes.some((n) => n.body.includes("s. 419(5) BNSS"))).toBe(true);
  });
});

describe("input validation", () => {
  it("rejects a missing article or date", () => {
    expect(computeLimitation({ articleId: "999", startDate: "2026-01-01" })).toMatchObject({ ok: false });
    expect(computeLimitation({ articleId: "19", startDate: "" })).toMatchObject({ ok: false });
    expect(computeLimitation({ articleId: "19", startDate: "2026-02-30" })).toMatchObject({ ok: false });
    expect(computeLimitation({ articleId: "19", startDate: "1800-01-01" })).toMatchObject({ ok: false });
  });

  it("produces a numbered working that starts with the article", () => {
    const r = ok({ articleId: "123", startDate: "2026-01-01", today: "2026-01-05" });
    expect(r.steps[0].title).toBe("Article 123 of the Schedule applies");
    expect(r.steps[0].detail).toContain("The date of the decree or where the summons or notice was not duly served");
    expect(r.steps.at(-1)?.title).toMatch(/As on 5 Jan 2026: 26 days left/);
  });
});
