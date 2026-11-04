import { describe, expect, it } from "vitest";
import { balanceOf, daysOverdue, displayStatus, isOverdue, statusAfterPayments } from "./status";

const base = { status: "issued", totalPaise: 10_000_00, paidPaise: 0, dueDate: "2026-11-01" };

describe("invoice status", () => {
  it("derives overdue from the due date", () => {
    expect(displayStatus(base, "2026-11-03")).toBe("overdue");
    expect(displayStatus(base, "2026-11-01")).toBe("issued");
    expect(displayStatus({ ...base, dueDate: null }, "2030-01-01")).toBe("issued");
    expect(displayStatus({ ...base, status: "partly_paid", paidPaise: 4_000_00 }, "2026-10-30")).toBe("partly_paid");
    expect(displayStatus({ ...base, status: "partly_paid", paidPaise: 4_000_00 }, "2026-11-02")).toBe("overdue");
    expect(displayStatus({ ...base, status: "paid", paidPaise: 10_000_00 }, "2027-01-01")).toBe("paid");
    expect(displayStatus({ ...base, status: "cancelled" }, "2027-01-01")).toBe("cancelled");
  });

  it("computes balances", () => {
    expect(balanceOf({ ...base, status: "partly_paid", paidPaise: 4_000_00 })).toBe(6_000_00);
    expect(balanceOf({ ...base, status: "cancelled" })).toBe(0);
    expect(balanceOf({ ...base, status: "paid", paidPaise: 10_000_00 })).toBe(0);
    expect(isOverdue({ ...base, status: "cancelled" }, "2027-01-01")).toBe(false);
  });

  it("moves to partly paid and paid as receipts arrive", () => {
    expect(statusAfterPayments(10_000_00, 0)).toBe("issued");
    expect(statusAfterPayments(10_000_00, 1)).toBe("partly_paid");
    expect(statusAfterPayments(10_000_00, 10_000_00)).toBe("paid");
  });

  it("counts days overdue", () => {
    expect(daysOverdue("2026-11-01", "2026-11-03")).toBe(2);
    expect(daysOverdue("2026-11-05", "2026-11-03")).toBe(0);
  });
});
