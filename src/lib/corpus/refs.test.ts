import { describe, expect, it } from "vitest";
import { normaliseActId } from "./acts";
import { isPureReference, parseSectionRefs } from "./refs";
import { governingCode, parseIndianDate } from "./rules";

const refs = (q: string) => parseSectionRefs(q).map((r) => `${r.actId ?? "*"}:${r.sectionNo}`);

describe("parseSectionRefs", () => {
  it("reads common citation styles", () => {
    expect(refs("s. 103 BNS")).toEqual(["BNS:103"]);
    expect(refs("s.103 BNS")).toEqual(["BNS:103"]);
    expect(refs("section 302 IPC")).toEqual(["IPC:302"]);
    expect(refs("BNSS 480")).toEqual(["BNSS:480"]);
    expect(refs("u/s 498A IPC")).toEqual(["IPC:498A"]);
    expect(refs("Sec. 482 Cr.P.C.")).toEqual(["CRPC:482"]);
    expect(refs("section 65B of the Evidence Act")).toEqual(["IEA:65B"]);
    expect(refs("Section 138 NI Act")).toEqual(["NIA:138"]);
    expect(refs("103(1) BNS")).toEqual(["BNS:103"]);
    expect(refs("Bharatiya Nyaya Sanhita section 318")).toEqual(["BNS:318"]);
  });

  it("keeps BNS and BNSS apart", () => {
    expect(refs("BNS 103 and BNSS 480")).toEqual(["BNS:103", "BNSS:480"]);
  });

  it("accepts a bare lettered or lone section number without an act", () => {
    expect(refs("498A")).toEqual(["*:498A"]);
    expect(refs("302")).toEqual(["*:302"]);
    expect(refs("section 304A")).toEqual(["*:304A"]);
  });

  it("applies one act name to a list of numbers", () => {
    expect(refs("sections 302 and 307 IPC")).toEqual(["IPC:302", "IPC:307"]);
  });

  it("ignores years, ordinals and ordinary numbers in sentences", () => {
    expect(refs("Bharatiya Nyaya Sanhita 2023")).toEqual([]);
    expect(refs("bail after 90 days custody")).toEqual([]);
    expect(refs("the 3rd proviso")).toEqual([]);
  });

  it("does not read 'i.e. a' as the Evidence Act", () => {
    expect(normaliseActId("i.e. a person")).toBeNull();
    expect(normaliseActId("CrPC")).toBe("CRPC");
    expect(normaliseActId("Cr.P.C.")).toBe("CRPC");
    expect(normaliseActId("bns")).toBe("BNS");
  });
});

describe("isPureReference", () => {
  it("detects reference-only queries", () => {
    expect(isPureReference("s. 103 BNS")).toBe(true);
    expect(isPureReference("BNSS 480")).toBe(true);
    expect(isPureReference("498A")).toBe(true);
    expect(isPureReference("anticipatory bail BNSS 482")).toBe(false);
  });
});

describe("governingCode", () => {
  const d = (s: string) => parseIndianDate(s)!;
  it("uses the IPC for offences before 1 July 2024", () => {
    expect(governingCode("substantive", d("2024-06-30")).code).toBe("IPC");
    expect(governingCode("substantive", d("2024-07-01")).code).toBe("BNS");
  });
  it("applies the savings clauses for procedure and evidence", () => {
    expect(governingCode("procedure", d("2024-06-30")).code).toBe("CRPC");
    expect(governingCode("procedure", d("2024-07-01")).code).toBe("BNSS");
    expect(governingCode("evidence", d("2023-01-15")).code).toBe("IEA");
    expect(governingCode("evidence", d("2025-01-15")).authority.sectionNo).toBe("170");
  });
  it("rejects malformed dates", () => {
    expect(parseIndianDate("30/06/2024")).toBeNull();
    expect(parseIndianDate("2024-13-40")).toBeNull();
  });
});
