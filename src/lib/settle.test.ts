import { describe, expect, it } from "vitest";
import { computeBalances, settle, type Balance, type Payment } from "./settle";
import { equalSplit } from "./split";
import type { Group } from "./types";

const bal = (memberId: string, amount: number): Balance => ({
  memberId,
  amount,
  paid: Math.max(0, amount),
  share: Math.max(0, -amount),
});

/** A settlement is only valid if it moves every balance to zero. */
function applies(balances: Balance[], payments: Payment[]): boolean {
  const net = new Map(balances.map((b) => [b.memberId, b.amount]));
  for (const p of payments) {
    if (p.amount <= 0) return false;
    net.set(p.fromId, (net.get(p.fromId) ?? 0) + p.amount);
    net.set(p.toId, (net.get(p.toId) ?? 0) - p.amount);
  }
  return [...net.values()].every((v) => v === 0);
}

describe("settle", () => {
  it("returns nothing when everyone is square", () => {
    expect(settle([bal("a", 0), bal("b", 0)])).toEqual([]);
  });

  it("handles a single debt", () => {
    const balances = [bal("a", -500), bal("b", 500)];
    const payments = settle(balances);
    expect(payments).toEqual([{ fromId: "a", toId: "b", amount: 500 }]);
    expect(applies(balances, payments)).toBe(true);
  });

  it("clears three-way balances in two payments", () => {
    const balances = [bal("a", -1000), bal("b", 400), bal("c", 600)];
    const payments = settle(balances);
    expect(payments).toHaveLength(2);
    expect(applies(balances, payments)).toBe(true);
  });

  it("finds cancelling subgroups instead of chaining everyone", () => {
    // Two independent pairs: the minimum is 2 payments, not 3.
    const balances = [bal("a", -500), bal("b", 500), bal("c", -300), bal("d", 300)];
    const payments = settle(balances);
    expect(payments).toHaveLength(2);
    expect(applies(balances, payments)).toBe(true);
  });

  it("beats naive chaining on a case where greedy is suboptimal", () => {
    const balances = [
      bal("a", -100),
      bal("b", -200),
      bal("c", -300),
      bal("d", 100),
      bal("e", 200),
      bal("f", 300),
    ];
    const payments = settle(balances);
    expect(payments).toHaveLength(3);
    expect(applies(balances, payments)).toBe(true);
  });

  it("never needs more than n-1 payments", () => {
    const balances = [bal("a", -700), bal("b", 100), bal("c", 200), bal("d", 400)];
    const payments = settle(balances);
    expect(payments.length).toBeLessThanOrEqual(balances.length - 1);
    expect(applies(balances, payments)).toBe(true);
  });

  it("still produces a valid plan past the exact-search limit", () => {
    const balances: Balance[] = [];
    for (let i = 0; i < 20; i++) balances.push(bal(`m${i}`, i < 10 ? -(i + 1) * 100 : (i - 9) * 100));
    const payments = settle(balances);
    expect(applies(balances, payments)).toBe(true);
  });
});

function makeGroup(over: Partial<Group> = {}): Group {
  return {
    id: "g1",
    name: "Trip",
    baseCurrency: "USD",
    members: [
      { id: "a", name: "Ana", colorIndex: 0 },
      { id: "b", name: "Ben", colorIndex: 1 },
      { id: "c", name: "Cy", colorIndex: 2 },
    ],
    entries: [],
    rates: { EUR: 1.1 },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("computeBalances", () => {
  it("credits the payer and debits the participants", () => {
    const group = makeGroup({
      entries: [
        {
          kind: "expense",
          id: "e1",
          title: "Dinner",
          amount: 3000,
          currency: "USD",
          date: "2026-01-01",
          payerId: "a",
          split: equalSplit(["a", "b", "c"]),
          category: "food",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const { balances, issues } = computeBalances(group);
    expect(issues).toEqual([]);
    expect(balances.find((b) => b.memberId === "a")?.amount).toBe(2000);
    expect(balances.find((b) => b.memberId === "b")?.amount).toBe(-1000);
    expect(balances.reduce((sum, b) => sum + b.amount, 0)).toBe(0);
  });

  it("excludes non-participants from an expense", () => {
    const group = makeGroup({
      entries: [
        {
          kind: "expense",
          id: "e1",
          title: "Taxi",
          amount: 1000,
          currency: "USD",
          date: "2026-01-01",
          payerId: "a",
          split: equalSplit(["a", "b"]),
          category: "transport",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const { balances } = computeBalances(group);
    expect(balances.find((b) => b.memberId === "c")?.amount).toBe(0);
  });

  it("treats a transfer as a payback, not consumption", () => {
    const group = makeGroup({
      entries: [
        {
          kind: "transfer",
          id: "t1",
          amount: 500,
          currency: "USD",
          date: "2026-01-02",
          fromId: "b",
          toId: "a",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const { balances } = computeBalances(group);
    expect(balances.find((b) => b.memberId === "b")?.amount).toBe(500);
    expect(balances.find((b) => b.memberId === "a")?.amount).toBe(-500);
    expect(balances.reduce((sum, b) => sum + b.amount, 0)).toBe(0);
  });

  it("a transfer cancels the matching debt exactly", () => {
    const group = makeGroup({
      entries: [
        {
          kind: "expense",
          id: "e1",
          title: "Hotel",
          amount: 2000,
          currency: "USD",
          date: "2026-01-01",
          payerId: "a",
          split: equalSplit(["a", "b"]),
          category: "lodging",
          createdAt: 0,
          updatedAt: 0,
        },
        {
          kind: "transfer",
          id: "t1",
          amount: 1000,
          currency: "USD",
          date: "2026-01-02",
          fromId: "b",
          toId: "a",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const { balances } = computeBalances(group);
    expect(balances.every((b) => b.amount === 0)).toBe(true);
    expect(settle(balances)).toEqual([]);
  });

  it("converts foreign-currency expenses into the base currency", () => {
    const group = makeGroup({
      entries: [
        {
          kind: "expense",
          id: "e1",
          title: "Museum",
          amount: 1000, // 10.00 EUR = 11.00 USD
          currency: "EUR",
          date: "2026-01-01",
          payerId: "a",
          split: equalSplit(["a", "b"]),
          category: "tickets",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const { balances } = computeBalances(group);
    expect(balances.find((b) => b.memberId === "a")?.amount).toBe(550);
    expect(balances.find((b) => b.memberId === "b")?.amount).toBe(-550);
  });

  it("reports a broken split instead of distorting balances", () => {
    const group = makeGroup({
      entries: [
        {
          kind: "expense",
          id: "e1",
          title: "Bad",
          amount: 1000,
          currency: "USD",
          date: "2026-01-01",
          payerId: "a",
          split: { mode: "exact", entries: [{ memberId: "b", value: 400 }] },
          category: "general",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const { balances, issues } = computeBalances(group);
    expect(issues).toHaveLength(1);
    expect(issues[0].entryId).toBe("e1");
    expect(balances.every((b) => b.amount === 0)).toBe(true);
  });

  it("ignores references to removed members without unbalancing the group", () => {
    const group = makeGroup({
      entries: [
        {
          kind: "expense",
          id: "e1",
          title: "Ghost",
          amount: 1000,
          currency: "USD",
          date: "2026-01-01",
          payerId: "a",
          split: equalSplit(["a", "zz"]),
          category: "general",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const { balances } = computeBalances(group);
    expect(balances.find((b) => b.memberId === "a")?.amount).toBe(500);
  });
});

describe("settle tie-breaking", () => {
  const totalMoved = (payments: Payment[]) => payments.reduce((sum, p) => sum + p.amount, 0);

  it("pays creditors directly instead of chaining through a third person", () => {
    // Ana is owed 125; Ben and Chris owe 62.50 each. Two payments either way,
    // but Chris should pay Ana, not route it through Ben.
    const balances = [bal("ana", 12500), bal("ben", -6250), bal("chris", -6250)];
    const payments = settle(balances);

    expect(payments).toHaveLength(2);
    expect(applies(balances, payments)).toBe(true);
    expect(totalMoved(payments)).toBe(12500);
    expect(payments.every((p) => p.toId === "ana")).toBe(true);
  });

  it("moves the least money among equally short plans", () => {
    const balances = [bal("a", -1000), bal("b", -1000), bal("c", 1000), bal("d", 1000)];
    const payments = settle(balances);

    expect(payments).toHaveLength(2);
    expect(applies(balances, payments)).toBe(true);
    expect(totalMoved(payments)).toBe(2000);
  });

  it("still never routes a debtor's money through another debtor", () => {
    const balances = [bal("a", -300), bal("b", -200), bal("c", 500)];
    const payments = settle(balances);

    expect(payments).toHaveLength(2);
    expect(payments.every((p) => p.toId === "c")).toBe(true);
    expect(applies(balances, payments)).toBe(true);
  });
});

describe("settle properties", () => {
  /** Deterministic PRNG so a failure is reproducible. */
  function makeRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  /** Random balances that always net to zero. */
  function randomBalances(random: () => number, n: number): Balance[] {
    const amounts: number[] = [];
    for (let i = 0; i < n - 1; i++) amounts.push(Math.round((random() - 0.5) * 20000));
    amounts.push(-amounts.reduce((a, b) => a + b, 0));
    return amounts.map((amount, i) => bal(`m${i}`, amount));
  }

  /** Minimum payments = people minus the most zero-sum subgroups, found by brute force. */
  function bruteForceMinimum(amounts: number[]): number {
    const n = amounts.length;
    const full = (1 << n) - 1;
    const best = new Array<number>(1 << n).fill(-1);
    best[0] = 0;
    for (let mask = 1; mask <= full; mask++) {
      for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
        let sum = 0;
        let size = 0;
        for (let i = 0; i < n; i++) {
          if (sub & (1 << i)) {
            sum += amounts[i];
            size++;
          }
        }
        if (sum !== 0 || best[mask ^ sub] < 0) continue;
        const candidate = best[mask ^ sub] + (size - 1);
        if (best[mask] < 0 || candidate < best[mask]) best[mask] = candidate;
      }
    }
    return best[full];
  }

  it("always produces a valid, minimal plan across random groups", () => {
    const random = makeRandom(20260910);
    for (let round = 0; round < 300; round++) {
      const n = 2 + (round % 7); // 2..8 people
      const balances = randomBalances(random, n);
      const payments = settle(balances);

      expect(applies(balances, payments)).toBe(true);

      const nonZero = balances.filter((b) => b.amount !== 0).map((b) => b.amount);
      if (nonZero.length > 0) {
        expect(payments.length).toBe(bruteForceMinimum(nonZero));
      }
    }
  });

  it("handles the largest exactly-searched group quickly", () => {
    const random = makeRandom(7);
    const balances = randomBalances(random, 12);
    const started = Date.now();
    const payments = settle(balances);
    expect(applies(balances, payments)).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("copes with everyone owing the same amount to one person", () => {
    const balances = [bal("a", 9000), ...Array.from({ length: 9 }, (_, i) => bal(`d${i}`, -1000))];
    const payments = settle(balances);
    expect(payments).toHaveLength(9);
    expect(payments.every((p) => p.toId === "a")).toBe(true);
    expect(applies(balances, payments)).toBe(true);
  });
});
