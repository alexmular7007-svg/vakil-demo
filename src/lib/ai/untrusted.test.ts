import { describe, expect, it } from "vitest";
import { sanitizeInline, sanitizeUntrusted } from "./untrusted";

describe("sanitizeUntrusted", () => {
  it("turns every angle bracket and look-alike into guillemets", () => {
    expect(sanitizeUntrusted("a < b > c")).toBe("a ‹ b › c");
    expect(sanitizeUntrusted("< /source >")).toBe("‹ /source ›");
    expect(sanitizeUntrusted("＜text＞ ﹤x﹥ 〈y〉 ⟨z⟩")).toBe("‹text› ‹x› ‹y› ‹z›");
  });

  it("rewrites source markers in any spacing or width", () => {
    expect(sanitizeUntrusted("see [S1], [ s 12 ] and ［S3］")).toBe("see (S1), (S12) and (S3)");
  });

  it("normalises line endings and squeezes long blank runs used to push text out of view", () => {
    expect(sanitizeUntrusted("a\r\nb\rc\n\n\n\n\nd")).toBe("a\nb\nc\n\nd");
  });
});

describe("sanitizeInline", () => {
  it("flattens to one line and caps the length", () => {
    expect(sanitizeInline("name\n[S4] Judgment: x")).toBe("name (S4) Judgment: x");
    expect(sanitizeInline("x".repeat(400), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
