import { writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { UnsupportedTextError, buildFinalPdf, inspectPdf, renderTextPdf } from "./pdf";

// 1x1 transparent PNG
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
);

describe("PDF generation", () => {
  it("renders an English draft across pages and refuses Devanagari", async () => {
    const body = Array.from({ length: 120 }, (_, i) => `${i + 1}. The parties agree to clause ${i + 1} — “in good faith”.`).join("\n\n");
    const bytes = await renderTextPdf({ title: "Service Agreement", body: `# Recitals\n\n${body}` });
    const { pageCount } = await inspectPdf(bytes);
    expect(pageCount).toBeGreaterThan(1);
    await expect(renderTextPdf({ title: "अनुबंध", body: "पक्षकार" })).rejects.toBeInstanceOf(UnsupportedTextError);
  });

  it("appends certificate pages after the original pages", async () => {
    const original = await renderTextPdf({ title: "NDA", body: "Short body." });
    const final = await buildFinalPdf(original, {
      envelopeId: "11111111-1111-4111-8111-111111111111",
      title: "NDA between A and B",
      category: "Non-disclosure agreement",
      ownerName: "Adv. Test",
      createdAtIst: "02 Nov 2026, 10:00:00 IST",
      sentAtIst: "02 Nov 2026, 10:05:00 IST",
      completedAtIst: "02 Nov 2026, 11:00:00 IST",
      originalSha256: "a".repeat(64),
      lockedSha256: "a".repeat(64),
      chainHeadHash: "b".repeat(64),
      chainEventCount: 12,
      verifyUrl: "http://localhost:3000/verify/11111111-1111-4111-8111-111111111111",
      recipients: [
        {
          roleLabel: "Lawyer",
          actionLabel: "Review and approve",
          routingOrder: 1,
          name: "Adv. Meera Rao",
          maskedEmail: "m***a@e***.com",
          authMethod: "Email one-time code (OTP)",
          outcome: "Approved",
          actedAtIst: "02 Nov 2026, 10:30:00 IST",
          ip: "203.0.113.5",
          userAgent: "Mozilla/5.0",
          consentVersion: "v1",
          signatureKind: null,
          signatureText: null,
          signaturePng: null,
          signatureSha256: null,
        },
        {
          roleLabel: "Sender",
          actionLabel: "Sign",
          routingOrder: 2,
          name: "राहुल शर्मा",
          maskedEmail: "r***a@g***.com",
          authMethod: "Email one-time code (OTP)",
          outcome: "Signed",
          actedAtIst: "02 Nov 2026, 10:45:00 IST",
          ip: "203.0.113.9",
          userAgent: "Mozilla/5.0",
          consentVersion: "v1",
          signatureKind: "drawn",
          signatureText: null,
          signaturePng: PNG,
          signatureSha256: "c".repeat(64),
        },
        {
          roleLabel: "Receiver",
          actionLabel: "Sign",
          routingOrder: 2,
          name: "Priya Nair",
          maskedEmail: "p***r@e***.com",
          authMethod: "Email one-time code (OTP)",
          outcome: "Signed",
          actedAtIst: "02 Nov 2026, 10:50:00 IST",
          ip: "203.0.113.10",
          userAgent: "Mozilla/5.0",
          consentVersion: "v1",
          signatureKind: "typed",
          signatureText: "Priya Nair",
          signaturePng: null,
          signatureSha256: "d".repeat(64),
        },
      ],
    });
    const doc = await PDFDocument.load(final);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    if (process.env.ESIGN_PDF_OUT) await writeFile(process.env.ESIGN_PDF_OUT, final);
  });
});
