import { parseAmount } from "./money";
import type { ParsedReceipt } from "./receipt";

/** Validate model output before it becomes a group expense. Amounts are major units. */
export function parseGeminiReceipt(value: unknown, currency: string): ParsedReceipt {
  if (!value || typeof value !== "object") throw new Error("The scanner returned an invalid receipt.");
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result.items)) throw new Error("The scanner returned no item list.");
  const items = result.items.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("The scanner returned an invalid item.");
    const item = raw as Record<string, unknown>;
    if (typeof item.name !== "string" || typeof item.amount !== "string") {
      throw new Error("The scanner returned an invalid item.");
    }
    const name = item.name.trim().slice(0, 80);
    const amount = parseAmount(item.amount, currency);
    if (!name || amount === null || amount <= 0) throw new Error("The scanner returned an invalid item price.");
    return { name, amount };
  });
  if (items.length > 100) throw new Error("This receipt has too many items to scan automatically.");
  const total = typeof result.total === "string" ? parseAmount(result.total, currency) : null;
  if (total !== null && total <= 0) throw new Error("The scanner returned an invalid total.");
  const title = typeof result.title === "string" && result.title.trim()
    ? result.title.trim().slice(0, 80) : "Receipt";
  return { title, items, total };
}
