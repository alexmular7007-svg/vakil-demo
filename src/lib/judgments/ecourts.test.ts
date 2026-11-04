import { describe, expect, it } from "vitest";
import { ddmmyyyy, decodeEntities, parseHcMetadata, parseScMetadata } from "./ecourts";

// Trimmed to the parts the parser reads; shaped like the datasets' raw_html.
const SC_HTML =
  `<button type='button' role='link' class='btn btn-link p-0 text-start' id='link_10' aria-label=" Ramesh Kumar @ Ramu versus The State of Bihar pdf"  class='noToken' href='#'>` +
  `<font size='4'> <strong>RAMESH KUMAR @ RAMU<span class='fst-italic'> versus </span>THE STATE OF BIHAR </strong>- <span class='escrText'>[2024] 10 S.C.R. 108</span><span class='ncDisplay'>2024 INSC 735</span></button></font><br>` +
  `<strong>Coram : BELA M. TRIVEDI<sup style="color: #268e97;" class="tooltip-sup" data-tooltip="Author">*</sup>, SATISH CHANDRA SHARMA</strong><br> Issue for Consideration Issue arose as regards reversal of an acquittal &ndash; ss. 302/34 IPC<br>` +
  `<strong class='caseDetailsTD' ><span style='color:#212F3D' > Decision Date :</span><font color='green'> 25-09-2024</font><span style='color:#212F3D' > | Case No :</span><font color='green'> CRIMINAL APPEAL No. 1031/2015</font></strong>`;

const HC_HTML =
  `<button type='button' role='link' aria-label="ACB/1/2024 of THE STATE OF MAHARASHTRA Vs GANESH KUMAR pdf"><font size='3'>ACB/1/2024 of THE STATE OF MAHARASHTRA Vs GANESH KUMAR</button></font><br>` +
  `<strong>Judge : HON'BLE SHRI JUSTICE S. G. DIGE</strong><br> IN THE HIGH COURT...<br>` +
  `<strong class='caseDetailsTD' ><span style='color:#212F3D'> CNR :</span><font color='green'> HCBM030000022024</font><span style='color:#212F3D' > | Decision Date :</span><font color='green'> 06-09-2024</font></strong>`;

describe("parseScMetadata", () => {
  it("reads title, citations, bench, date, case number and the issue", () => {
    expect(parseScMetadata({ raw_html: SC_HTML, nc_display: "2024INSC735" })).toEqual({
      title: "Ramesh Kumar @ Ramu v. The State of Bihar",
      court: "Supreme Court of India",
      decidedOn: "2024-09-25",
      citation: "2024 INSC 735; [2024] 10 S.C.R. 108",
      caseNo: "CRIMINAL APPEAL No. 1031/2015",
      bench: "Bela M. Trivedi, Satish Chandra Sharma",
      summary: "Issue arose as regards reversal of an acquittal – ss. 302/34 IPC",
    });
  });

  it("returns null without usable HTML", () => {
    expect(parseScMetadata({})).toBeNull();
    expect(parseScMetadata({ raw_html: "<p>nothing</p>" })).toBeNull();
  });
});

describe("parseHcMetadata", () => {
  it("reads the cause title, case number, judge and date", () => {
    expect(parseHcMetadata({ raw_html: HC_HTML, court_name: "Bombay High Court" })).toEqual({
      title: "The State of Maharashtra v. Ganesh Kumar",
      court: "Bombay High Court",
      decidedOn: "2024-09-06",
      citation: null,
      caseNo: "ACB/1/2024",
      bench: "S. G. DIGE",
      summary: null,
    });
  });
});

describe("helpers", () => {
  it("validates dd-mm-yyyy dates", () => {
    expect(ddmmyyyy("31-02-2024")).toBeNull();
    expect(ddmmyyyy("01-07-2024")).toBe("2024-07-01");
  });
  it("decodes HTML entities", () => {
    expect(decodeEntities("A &amp; B &#2361; &ndash;")).toBe("A & B ह –");
  });
});
