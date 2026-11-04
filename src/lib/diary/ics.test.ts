import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText, foldIcsLine, icsUtcStamp } from "./ics";

const unfold = (s: string) => s.replace(/\r\n /g, "");
const bytes = (s: string) => new TextEncoder().encode(s).length;

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon, comma and newlines (RFC 5545 3.3.11)", () => {
    expect(escapeIcsText("a\\b")).toBe("a\\\\b");
    expect(escapeIcsText("Sharma v. State; Bail, urgent")).toBe("Sharma v. State\\; Bail\\, urgent");
    expect(escapeIcsText("line1\nline2\r\nline3\rline4")).toBe("line1\\nline2\\nline3\\nline4");
    // Colons and quotes are fine in TEXT values.
    expect(escapeIcsText('Item: 14 "A"')).toBe('Item: 14 "A"');
  });
  it("escapes the backslash before adding new ones", () => {
    expect(escapeIcsText("\\;")).toBe("\\\\\\;");
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines alone", () => {
    expect(foldIcsLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });
  it("folds at 75 octets with CRLF + space and unfolds losslessly", () => {
    const line = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(bytes(p)).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(unfold(folded)).toBe(line);
  });
  it("never splits a multi-byte character", () => {
    const line = `SUMMARY:${"न्यायालय ".repeat(20)}`;
    const folded = foldIcsLine(line);
    for (const p of folded.split("\r\n")) {
      expect(bytes(p)).toBeLessThanOrEqual(75);
      expect(p).not.toContain("�");
    }
    expect(unfold(folded)).toBe(line);
  });
});

describe("buildIcs", () => {
  const now = new Date("2026-11-03T04:45:00Z");
  const ics = buildIcs(
    [
      {
        uid: "hearing-1@vaakil-ai",
        date: "2026-11-04",
        time: "10:30",
        summary: "Sharma v. State, Bail (Arguments)",
        location: "Sessions Court; Court hall 3",
        description: "Item no. 14\nCNR: DLCT010012342024",
      },
      { uid: "hearing-2@vaakil-ai", date: "2026-11-30", summary: "Untimed matter" },
      { uid: "hearing-3@vaakil-ai", date: "2026-12-31", time: "23:30", summary: "Late listing" },
    ],
    { now },
  );
  const lines = unfold(ics).split("\r\n");

  it("uses CRLF line endings throughout and ends with CRLF", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
  it("has the calendar envelope and the IST timezone", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("PRODID:-//Vaakil AI//Case diary//EN");
    expect(lines).toContain("TZID:Asia/Kolkata");
    expect(lines).toContain("TZOFFSETTO:+0530");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(3);
  });
  it("writes timed events in Asia/Kolkata with a one-hour end", () => {
    expect(lines).toContain("DTSTART;TZID=Asia/Kolkata:20261104T103000");
    expect(lines).toContain("DTEND;TZID=Asia/Kolkata:20261104T113000");
    expect(lines).toContain("DTSTAMP:20261103T044500Z");
  });
  it("writes untimed hearings as all-day events", () => {
    expect(lines).toContain("DTSTART;VALUE=DATE:20261130");
    expect(lines).toContain("DTEND;VALUE=DATE:20261201");
  });
  it("rolls the end time over midnight and year end", () => {
    expect(lines).toContain("DTSTART;TZID=Asia/Kolkata:20261231T233000");
    expect(lines).toContain("DTEND;TZID=Asia/Kolkata:20270101T003000");
  });
  it("escapes text values", () => {
    expect(lines).toContain("SUMMARY:Sharma v. State\\, Bail (Arguments)");
    expect(lines).toContain("LOCATION:Sessions Court\\; Court hall 3");
    expect(lines).toContain("DESCRIPTION:Item no. 14\\nCNR: DLCT010012342024");
  });
  it("formats UTC stamps", () => {
    expect(icsUtcStamp(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });
});
