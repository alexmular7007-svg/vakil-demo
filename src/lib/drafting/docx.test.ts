import { describe, expect, it } from "vitest";
import { contentDisposition, draftToDocx } from "./docx";
import { fillTemplate } from "./fill";
import { getTemplate } from "./catalog";

describe("draftToDocx", () => {
  it("builds a Word (zip) file for English and Hindi drafts", async () => {
    const t = getTemplate("cheque-bounce-notice-section-138")!;
    for (const [body, language] of [
      [t.bodyEn, "en"],
      [fillTemplate(t.bodyHi!, t.fields, { client_name: "आशा वर्मा" }, "hi"), "hi"],
    ] as const) {
      const buf = await draftToDocx(body, { title: "Notice", language });
      expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
      expect(buf.byteLength).toBeGreaterThan(3000);
    }
  });

  it("handles an empty draft", async () => {
    const buf = await draftToDocx("", { title: "Empty", language: "en" });
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});

describe("contentDisposition", () => {
  it("gives an ASCII fallback and a UTF-8 filename", () => {
    expect(contentDisposition("Bail application – Ram", "docx")).toBe(
      `attachment; filename="Bail-application-Ram.docx"; filename*=UTF-8''Bail%20application%20%E2%80%93%20Ram.docx`,
    );
    expect(contentDisposition("जमानत", "docx")).toMatch(/^attachment; filename="draft\.docx"; filename\*=UTF-8''%E0%A4/);
  });
});
