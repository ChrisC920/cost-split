import { convert } from "./money";
import { computeBalances } from "./settle";
import type { Group } from "./types";

/** Everything the group list needs to render one row, computed once. */
export interface GroupSummary {
  total: number;
  entryCount: number;
  memberCount: number;
  /** Net position of the member the device belongs to is unknown, so show group spend. */
  unsettled: boolean;
  issueCount: number;
}

export function summarize(group: Group): GroupSummary {
  let total = 0;
  for (const entry of group.entries) {
    // Transfers move money that was already counted; they aren't group spend.
    if (entry.kind !== "expense") continue;
    total += convert(entry.amount, entry.currency, group.baseCurrency, group.baseCurrency, group.rates);
  }

  const { balances, issues } = computeBalances(group);
  return {
    total,
    entryCount: group.entries.length,
    memberCount: group.members.length,
    unsettled: balances.some((b) => b.amount !== 0),
    issueCount: issues.length,
  };
}

/** Currencies actually used by a group's entries, base first. */
export function currenciesUsed(group: Group): string[] {
  const seen = new Set<string>([group.baseCurrency.toUpperCase()]);
  for (const entry of group.entries) seen.add(entry.currency.toUpperCase());
  return [...seen];
}
