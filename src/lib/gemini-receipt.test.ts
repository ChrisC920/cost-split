import { describe, expect, it } from "vitest";
import { parseGeminiReceipt } from "./gemini-receipt";

describe("Gemini receipt output", () => {
  it("turns decimal strings into currency minor units and keeps repeated items", () => {
    expect(parseGeminiReceipt({ title: "Corner Cafe", total: "11.34", items: [
      { name: "Coffee", amount: "4.50" },
      { name: "Coffee", amount: "4.50" },
      { name: "Cookie", amount: "1.50" },
    ] }, "USD")).toEqual({
      title: "Corner Cafe", total: 1134, items: [
        { name: "Coffee", amount: 450 },
        { name: "Coffee", amount: 450 },
        { name: "Cookie", amount: 150 },
      ],
    });
  });

  it("rejects malformed prices rather than adding a wrong expense", () => {
    expect(() => parseGeminiReceipt({ title: "Shop", total: "9.00", items: [
      { name: "Soup", amount: "unknown" },
    ] }, "USD")).toThrow("invalid item price");
  });
});
