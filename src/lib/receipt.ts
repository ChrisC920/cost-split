import { distribute } from "./split";
import { parseAmount } from "./money";
import type { ReceiptItem } from "./types";

export interface ParsedReceipt {
  title: string;
  items: { name: string; amount: number }[];
  total: number | null;
}

const TOTAL = /^(?:grand\s+total|amount\s+due|balance\s+due|total\s+due|total)\b/i;
const EXTRA = /^(?:sub\s*total|tax|vat|gst|tip|gratuity|service|discount|change|cash|card|visa|mastercard|amex|payment|paid)\b/i;
const MONEY = /(?:[$€£]\s*)?(-?\d[\d,.]*[.,]\d{2,3}|-?\d+)(?:\s*[$€£])?$/;

/** Extract likely purchased lines, then let the user correct OCR mistakes. */
export function parseReceipt(text: string, currency: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const items: ParsedReceipt["items"] = [];
  let total: number | null = null;
  let title = "Receipt";

  for (const line of lines) {
    const match = line.match(MONEY);
    if (!match) {
      if (title === "Receipt" && /[a-z]{3}/i.test(line) && !/receipt|order|date|time|thank/i.test(line)) title = line.slice(0, 80);
      continue;
    }
    const amount = parseAmount(match[1], currency);
    if (amount === null) continue;
    const name = line.slice(0, match.index).replace(/[.·\s$€£]+$/, "").trim();
    if (!name) continue;
    if (TOTAL.test(name)) { total = amount; continue; }
    if (EXTRA.test(name) || /\b(?:subtotal|total|tax|tip|change)\b/i.test(name)) continue;
    if (amount > 0 && /[a-z]{2}/i.test(name)) items.push({ name: name.slice(0, 80), amount });
  }
  return { title, items, total };
}

/** Allocate item prices and any tax/tip difference without losing a cent. */
export function receiptShares(total: number, items: ReceiptItem[]): Map<string, number> {
  const shares = new Map<string, number>();
  const claimed = items.filter((item) => item.amount > 0 && item.memberIds.length > 0);
  if (!claimed.length) return shares;
  const itemTotals = claimed.map((item) => item.amount);
  const remainder = total - itemTotals.reduce((sum, amount) => sum + amount, 0);
  const extras = distribute(remainder, itemTotals);
  claimed.forEach((item, index) => {
    const allocated = distribute(item.amount + extras[index], item.memberIds.map(() => 1));
    item.memberIds.forEach((id, participant) => shares.set(id, (shares.get(id) ?? 0) + allocated[participant]));
  });
  return shares;
}

export function receiptSplit(total: number, items: ReceiptItem[]) {
  return {
    mode: "exact" as const,
    entries: [...receiptShares(total, items)].map(([memberId, value]) => ({ memberId, value })),
  };
}
