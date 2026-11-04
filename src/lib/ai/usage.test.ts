import { describe, expect, it, vi } from "vitest";

const values = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: (v: unknown) => {
        values(v);
        return { onConflictDoUpdate: vi.fn(async () => {}) };
      },
    })),
  },
}));

import { recordUsage, usageTotals } from "./usage";

describe("usage accounting", () => {
  it("adds up billed attempts across providers at each provider's price", () => {
    const t = usageTotals(
      [
        { provider: "anthropic", tier: "standard", tokensIn: 1_000, tokensOut: 100 }, // failed after billing: 2,000 + 1,000
        { provider: "google", tier: "standard", tokensIn: 1_000, tokensOut: 100 }, // answered: 750 + 375
      ],
      true,
    );
    expect(t).toEqual({ queries: 1, tokensIn: 2_000, tokensOut: 200, costMicros: 4_125 });
  });

  it("records a failed but billed request without counting a query, and skips empty ones", async () => {
    await recordUsage("u1", [{ provider: "anthropic", tier: "fast", tokensIn: 10, tokensOut: 0 }], false);
    expect(values).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "u1", queries: 0, tokensIn: 10, tokensOut: 0, costMicros: 1 }));
    values.mockClear();
    await recordUsage("u1", [], false);
    expect(values).not.toHaveBeenCalled();
  });
});
