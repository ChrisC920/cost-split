import { describe, expect, it } from "vitest";
import { applyClaims } from "./cloud";
import type { Group } from "./types";

const group: Group = {
  id: "group", name: "Dinner", baseCurrency: "USD", members: [
    { id: "a", name: "Ana", colorIndex: 0 }, { id: "b", name: "Ben", colorIndex: 1 },
  ], rates: {}, createdAt: 1, updatedAt: 1,
  entries: [{ kind: "expense", id: "entry", title: "Dinner", amount: 1100, currency: "USD",
    date: "2026-09-26", payerId: "a", category: "food", createdAt: 1, updatedAt: 1,
    split: { mode: "equal", entries: [{ memberId: "a", value: 0 }] },
    receiptItems: [{ id: "coffee", name: "Coffee", amount: 1000, memberIds: ["a"] }],
  }],
};

describe("cloud receipt claims", () => {
  it("leaves new receipt items unchecked until someone claims them", () => {
    const fresh: Group = { ...group, entries: group.entries.map((entry) => entry.kind === "expense"
      ? { ...entry, receiptItems: [{ id: "coffee", name: "Coffee", amount: 1000, memberIds: [] }] }
      : entry) };
    const result = applyClaims(fresh, []);
    const receipt = result.entries[0];
    if (receipt.kind !== "expense") throw new Error("Expected expense");
    expect(receipt.receiptItems?.[0].memberIds).toEqual([]);
    expect(receipt.split.entries).toEqual([{ memberId: "a", value: 1100 }]);
  });

  it("lets the payer uncheck the last claim without checking it again on refresh", () => {
    const claims = [
      { group_id: "group", entry_id: "entry", item_id: "coffee", user_uid: "user-a", member_id: "a", selected: false },
    ];
    const result = applyClaims(group, claims);
    const receipt = result.entries[0];
    if (receipt.kind !== "expense") throw new Error("Expected expense");
    expect(receipt.receiptItems?.[0].memberIds).toEqual([]);
    expect(receipt.split.entries).toEqual([{ memberId: "a", value: 1100 }]);
  });

  it("keeps the payer until they opt out, then uses each person's own claim", () => {
    const claims = [
      { group_id: "group", entry_id: "entry", item_id: "coffee", user_uid: "user-b", member_id: "b", selected: true },
      { group_id: "group", entry_id: "entry", item_id: "coffee", user_uid: "user-a", member_id: "a", selected: false },
    ];
    const result = applyClaims(group, claims);
    const receipt = result.entries[0];
    if (receipt.kind !== "expense") throw new Error("Expected expense");
    expect(receipt.receiptItems?.[0].memberIds).toEqual(["b"]);
    expect(receipt.split.entries).toEqual([{ memberId: "b", value: 1100 }]);
  });
});
