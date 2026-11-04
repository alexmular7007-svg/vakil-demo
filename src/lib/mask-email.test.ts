import { describe, expect, it } from "vitest";
import { maskEmail } from "./utils";

describe("maskEmail", () => {
  it("keeps the first and last letter of the name and the domain", () => {
    expect(maskEmail("Asha.Verma@Gmail.com")).toBe("a***a@gmail.com");
    expect(maskEmail("ab@x.in")).toBe("a***@x.in");
    expect(maskEmail("not-an-email")).toBe("***");
  });
});
