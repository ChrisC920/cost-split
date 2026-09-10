import { describe, expect, it } from "vitest";
import { computeShares, distribute } from "./split";

describe("distribute", () => {
  it("always sums to the total", () => {
    expect(distribute(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(distribute(1000, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("respects weights", () => {
    expect(distribute(900, [2, 1])).toEqual([600, 300]);
    expect(distribute(100, [3, 1])).toEqual([75, 25]);
  });

  it("gives leftovers to the largest remainders", () => {
    // 100 / 6 = 16.66 each; four cents left over.
    const result = distribute(100, [1, 1, 1, 1, 1, 1]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result).toEqual([17, 17, 17, 17, 16, 16]);
  });

  it("handles zero and single-participant cases", () => {
    expect(distribute(0, [1, 1])).toEqual([0, 0]);
    expect(distribute(777, [5])).toEqual([777]);
  });

  it("falls back to an even split when all weights are zero", () => {
    expect(distribute(100, [0, 0])).toEqual([50, 50]);
  });

  it("keeps negative totals summing correctly", () => {
    expect(distribute(-1000, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(-1000);
  });

  it("is deterministic across repeated calls", () => {
    const a = distribute(1000, [1, 1, 1]);
    const b = distribute(1000, [1, 1, 1]);
    expect(a).toEqual(b);
  });
});

describe("computeShares", () => {
  const ids = ["a", "b", "c"];

  it("splits equally", () => {
    const { shares, error } = computeShares(1000, {
      mode: "equal",
      entries: ids.map((memberId) => ({ memberId, value: 0 })),
    });
    expect(error).toBeUndefined();
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("splits by coefficient", () => {
    const { shares } = computeShares(400, {
      mode: "shares",
      entries: [
        { memberId: "a", value: 3 },
        { memberId: "b", value: 1 },
      ],
    });
    expect(shares.get("a")).toBe(300);
    expect(shares.get("b")).toBe(100);
  });

  it("accepts exact amounts that add up", () => {
    const { shares, error } = computeShares(1000, {
      mode: "exact",
      entries: [
        { memberId: "a", value: 700 },
        { memberId: "b", value: 300 },
      ],
    });
    expect(error).toBeUndefined();
    expect(shares.get("a")).toBe(700);
  });

  it("rejects exact amounts that do not add up", () => {
    const { error } = computeShares(1000, {
      mode: "exact",
      entries: [{ memberId: "a", value: 700 }],
    });
    expect(error).toBeTruthy();
  });

  it("rejects percentages that do not total 100", () => {
    const { error } = computeShares(1000, {
      mode: "percent",
      entries: [
        { memberId: "a", value: 5000 },
        { memberId: "b", value: 4000 },
      ],
    });
    expect(error).toMatch(/90/);
  });

  it("accepts percentages totalling 100", () => {
    const { shares, error } = computeShares(1000, {
      mode: "percent",
      entries: [
        { memberId: "a", value: 2500 },
        { memberId: "b", value: 7500 },
      ],
    });
    expect(error).toBeUndefined();
    expect(shares.get("a")).toBe(250);
    expect(shares.get("b")).toBe(750);
  });

  it("errors when nobody takes part", () => {
    expect(computeShares(100, { mode: "equal", entries: [] }).error).toBeTruthy();
  });
});
