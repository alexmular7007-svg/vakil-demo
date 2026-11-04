import { describe, expect, it } from "vitest";
import { hearingStatusChip, taskDueChip, whatsappMessage, whenLine } from "./format";
import { ECOURTS_CNR_URL, ECOURTS_HC_URL, ecourtsUrl, googleCalendarUrl, isCnr, normaliseCnr, timedRange, whatsappUrl } from "./links";

const hearing = {
  caseTitle: "Sharma v. State",
  court: "Sessions Court, Lucknow",
  bench: "Court hall 3",
  itemNo: "14",
  hearingTime: "10:30",
  hearingDate: "2026-11-04",
  purpose: "Arguments",
  caseNo: "BA 123/2026",
  cnr: "UPLK010012342026",
};

describe("CNR", () => {
  it("normalises and validates", () => {
    expect(normaliseCnr(" dlct-0100 1234 2024 ")).toBe("DLCT010012342024");
    expect(isCnr("DLCT010012342024")).toBe(true);
    expect(isCnr("DLCT01001234202")).toBe(false);
    expect(isCnr("dlct010012342024")).toBe(false);
    expect(isCnr(null)).toBe(false);
  });
  it("points to the official eCourts portals only", () => {
    expect(ecourtsUrl("DLCT010012342024", "Saket District Court")).toBe(ECOURTS_CNR_URL);
    expect(ecourtsUrl("DLHC010012342023", null)).toBe(ECOURTS_HC_URL);
    expect(ecourtsUrl("HCBM010012342019", null)).toBe(ECOURTS_HC_URL);
    expect(ecourtsUrl(null, "Allahabad High Court")).toBe(ECOURTS_HC_URL);
    expect(new URL(ECOURTS_CNR_URL).hostname).toBe("services.ecourts.gov.in");
    expect(new URL(ECOURTS_HC_URL).hostname).toBe("hcservices.ecourts.gov.in");
  });
});

describe("WhatsApp", () => {
  it("builds the client message", () => {
    expect(whatsappMessage(hearing)).toBe(
      "Next date in Sharma v. State is Wednesday, 4 November 2026 before Sessions Court, Lucknow, Court hall 3, item no. 14, at 10:30 am, for Arguments.\nCase no. BA 123/2026\nCNR: UPLK010012342026",
    );
  });
  it("omits missing parts cleanly", () => {
    expect(
      whatsappMessage({ caseTitle: "  Gupta   v. Gupta ", hearingDate: "2026-12-01", court: null, bench: null, itemNo: null, hearingTime: null, purpose: null }),
    ).toBe("Next date in Gupta v. Gupta is Tuesday, 1 December 2026.");
  });
  it("encodes the message into a wa.me share link with no number", () => {
    const url = new URL(whatsappUrl(hearing));
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("text")).toBe(whatsappMessage(hearing));
  });
});

describe("Google Calendar", () => {
  it("builds a timed template link in IST", () => {
    const url = new URL(googleCalendarUrl(hearing));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261104T103000/20261104T113000");
    expect(url.searchParams.get("ctz")).toBe("Asia/Kolkata");
    expect(url.searchParams.get("text")).toBe("Sharma v. State (Arguments)");
    expect(url.searchParams.get("location")).toBe("Sessions Court, Lucknow · Court hall 3");
    expect(url.searchParams.get("details")).toContain("Item no. 14");
  });
  it("makes untimed hearings all-day", () => {
    const url = new URL(googleCalendarUrl({ ...hearing, hearingTime: null, court: null, bench: null }));
    expect(url.searchParams.get("dates")).toBe("20261104/20261105");
    expect(url.searchParams.has("location")).toBe(false);
  });
  it("computes wall-clock ranges", () => {
    expect(timedRange("2026-11-04", "16:45", 30)).toEqual({ start: "20261104T164500", end: "20261104T171500" });
  });
});

describe("chips", () => {
  const today = "2026-11-03";
  it("labels hearing status", () => {
    expect(hearingStatusChip({ status: "scheduled", hearingDate: today }, today)).toEqual({ label: "Listed today", tone: "info" });
    expect(hearingStatusChip({ status: "scheduled", hearingDate: "2026-11-01" }, today)).toEqual({ label: "Outcome pending", tone: "warning" });
    expect(hearingStatusChip({ status: "scheduled", hearingDate: "2026-11-09" }, today).tone).toBe("info");
    expect(hearingStatusChip({ status: "done", hearingDate: today }, today).tone).toBe("success");
    expect(hearingStatusChip({ status: "adjourned", hearingDate: today }, today).tone).toBe("warning");
    expect(hearingStatusChip({ status: "cancelled", hearingDate: today }, today).tone).toBe("neutral");
  });
  it("labels task due dates", () => {
    expect(taskDueChip(null, false, today)).toBeNull();
    expect(taskDueChip("2026-11-01", false, today)).toEqual({ label: "Overdue · 1 Nov", tone: "danger" });
    expect(taskDueChip(today, false, today)).toEqual({ label: "Due today", tone: "warning" });
    expect(taskDueChip("2026-11-01", true, today)?.tone).toBe("neutral");
  });
  it("builds the when line", () => {
    expect(whenLine({ hearingDate: "2026-11-04", hearingTime: "10:30", itemNo: "14" })).toBe("Wed, 4 Nov · 10:30 am · Item 14");
    expect(whenLine({ hearingDate: "2026-11-04", hearingTime: null, itemNo: null }, { withDate: false })).toBe("");
  });
});
