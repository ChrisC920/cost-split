import { describe, expect, it } from "vitest";
import { parseReceipt, receiptShares, receiptSplit } from "./receipt";
import { computeShares } from "./split";

describe("receipt reading", () => {
  it("extracts purchased items and the final total", () => {
    expect(parseReceipt("CORNER CAFE\nCoffee 4.50\nBagel 6.00\nSubtotal 10.50\nTax 0.84\nTOTAL 11.34", "USD"))
      .toEqual({ title: "CORNER CAFE", items: [{ name: "Coffee", amount: 450 }, { name: "Bagel", amount: 600 }], total: 1134 });
  });
});

describe("receipt splitting", () => {
  it("splits shared items and distributes tax to item owners", () => {
    const items = [
      { id: "a", name: "Coffee", amount: 400, memberIds: ["a", "b"] },
      { id: "b", name: "Sandwich", amount: 600, memberIds: ["b"] },
    ];
    const shares = receiptShares(1100, items);
    expect(shares.get("a")).toBe(220);
    expect(shares.get("b")).toBe(880);
    expect(computeShares(1100, receiptSplit(1100, items)).error).toBeUndefined();
  });
});
