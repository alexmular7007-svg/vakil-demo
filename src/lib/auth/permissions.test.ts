import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLES, can, toRole } from "./permissions";

describe("permissions", () => {
  it("gives admins the admin console and no one else", () => {
    expect(can({ role: "admin" }, "admin.console")).toBe(true);
    expect(can({ role: "advocate" }, "admin.console")).toBe(false);
    expect(can({ role: "user" }, "admin.console")).toBe(false);
    expect(can(null, "admin.console")).toBe(false);
  });

  it("treats unknown or missing roles as the least privileged", () => {
    expect(toRole("superuser")).toBe("user");
    expect(toRole(undefined)).toBe("user");
    expect(can({ role: "ADMIN" }, "admin.console")).toBe(false);
  });

  it("only refers to known roles", () => {
    for (const roles of Object.values(PERMISSIONS)) for (const r of roles) expect(ROLES).toContain(r);
  });

  it("lets advocates and admins open the consultation inbox", () => {
    expect(can({ role: "advocate" }, "advocate.inbox")).toBe(true);
    expect(can({ role: "user" }, "advocate.inbox")).toBe(false);
  });
});
