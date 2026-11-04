import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DraftDocument } from "@/components/drafting/draft-document";
import { templateCatalog } from "./catalog";
import { fillTemplate } from "./fill";

describe("DraftDocument", () => {
  it("renders every template in each language, with placeholders as labelled marks", () => {
    for (const t of templateCatalog) {
      const labels = Object.fromEntries(t.fields.map((f) => [f.name, f.label]));
      const html = renderToStaticMarkup(createElement(DraftDocument, { body: t.bodyEn, labels }));
      expect(html, t.slug).toContain("draft-placeholder");
      expect(html, t.slug).not.toContain("{{");
      if (t.bodyHi) {
        const hi = renderToStaticMarkup(createElement(DraftDocument, { body: fillTemplate(t.bodyHi, t.fields, {}, "hi"), language: "hi" }));
        expect(hi, t.slug).toContain('lang="hi"');
      }
    }
  });

  it("escapes user text instead of rendering HTML", () => {
    const html = renderToStaticMarkup(createElement(DraftDocument, { body: '<script>alert("x")</script> **bold**' }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<strong class="font-bold">bold</strong>');
  });
});
