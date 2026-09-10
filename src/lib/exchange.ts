import { convert } from "./money";
import { computeShares } from "./split";
import type { Group } from "./types";

/** Per-person totals for the report. All figures in the group's base currency. */
export interface PersonSummary {
  memberId: string;
  name: string;
  paid: number;
  share: number;
  balance: number;
  /** Number of expenses this person fronted. */
  paidCount: number;
}

export function personSummaries(group: Group): PersonSummary[] {
  const summaries = new Map<string, PersonSummary>(
    group.members.map((m) => [
      m.id,
      { memberId: m.id, name: m.name, paid: 0, share: 0, balance: 0, paidCount: 0 },
    ]),
  );

  const toBase = (amount: number, currency: string) =>
    convert(amount, currency, group.baseCurrency, group.baseCurrency, group.rates);

  for (const entry of group.entries) {
    if (entry.kind === "transfer") {
      const base = toBase(entry.amount, entry.currency);
      const from = summaries.get(entry.fromId);
      const to = summaries.get(entry.toId);
      if (from) from.paid += base;
      if (to) to.share += base;
      continue;
    }

    const { shares, error } = computeShares(entry.amount, entry.split);
    if (error) continue;

    const payer = summaries.get(entry.payerId);
    if (payer) {
      payer.paid += toBase(entry.amount, entry.currency);
      payer.paidCount += 1;
    }
    for (const [memberId, amount] of shares) {
      const target = summaries.get(memberId);
      if (target) target.share += toBase(amount, entry.currency);
    }
  }

  const list = [...summaries.values()];
  for (const summary of list) summary.balance = summary.paid - summary.share;
  return list;
}

/** Spend per category, base currency, largest first. Transfers are excluded. */
export function categoryTotals(group: Group): { category: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const entry of group.entries) {
    if (entry.kind !== "expense") continue;
    const base = convert(entry.amount, entry.currency, group.baseCurrency, group.baseCurrency, group.rates);
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + base);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

/** Totals in each currency actually used, for the report's currency section. */
export function currencyTotals(group: Group): {
  currency: string;
  total: number;
  rate: number;
  inBase: number;
}[] {
  const totals = new Map<string, number>();
  for (const entry of group.entries) {
    if (entry.kind !== "expense") continue;
    const code = entry.currency.toUpperCase();
    totals.set(code, (totals.get(code) ?? 0) + entry.amount);
  }

  const base = group.baseCurrency.toUpperCase();
  return [...totals.entries()]
    .map(([currency, total]) => ({
      currency,
      total,
      rate: currency === base ? 1 : (group.rates[currency] ?? 1),
      inBase: convert(total, currency, base, base, group.rates),
    }))
    .sort((a, b) => b.inBase - a.inBase);
}
