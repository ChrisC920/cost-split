import { convert } from "./money";
import { computeShares } from "./split";
import type { Entry, Group } from "./types";

export interface Balance {
  memberId: string;
  /** Minor units of the group's base currency. Positive = is owed, negative = owes. */
  amount: number;
  /** Total this member fronted, in base currency. */
  paid: number;
  /** Total this member consumed, in base currency. */
  share: number;
}

export interface Payment {
  fromId: string;
  toId: string;
  /** Minor units of the group's base currency. */
  amount: number;
}

/** Problems found while computing balances, so the UI can point at bad entries. */
export interface BalanceIssue {
  entryId: string;
  message: string;
}

export interface BalanceResult {
  balances: Balance[];
  issues: BalanceIssue[];
}

/**
 * Net every member out across all expenses and transfers, in base currency.
 *
 * Entries with a broken split are skipped and reported rather than silently
 * distorting everyone's balance.
 */
export function computeBalances(group: Group): BalanceResult {
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  const issues: BalanceIssue[] = [];

  for (const member of group.members) {
    paid.set(member.id, 0);
    share.set(member.id, 0);
  }

  const add = (map: Map<string, number>, id: string, delta: number) => {
    if (!map.has(id)) return; // member was deleted; ignore
    map.set(id, (map.get(id) ?? 0) + delta);
  };

  const toBase = (entry: Entry) =>
    convert(entry.amount, entry.currency, group.baseCurrency, group.baseCurrency, group.rates);

  for (const entry of group.entries) {
    if (entry.kind === "transfer") {
      // A payback moves money without consuming anything: the sender behaves as
      // if they paid, the receiver as if they consumed.
      const base = toBase(entry);
      add(paid, entry.fromId, base);
      add(share, entry.toId, base);
      continue;
    }

    const { shares, error } = computeShares(entry.amount, entry.split);
    if (error) {
      issues.push({ entryId: entry.id, message: error });
      continue;
    }

    add(paid, entry.payerId, toBase(entry));
    for (const [memberId, amount] of shares) {
      add(
        share,
        memberId,
        convert(amount, entry.currency, group.baseCurrency, group.baseCurrency, group.rates),
      );
    }
  }

  const balances = group.members.map((member) => {
    const p = paid.get(member.id) ?? 0;
    const s = share.get(member.id) ?? 0;
    return { memberId: member.id, amount: p - s, paid: p, share: s };
  });

  return { balances, issues };
}

/** Cost of a full search before we fall back to the greedy plan. */
const EXACT_SEARCH_LIMIT = 12;

/**
 * Build the shortest list of payments that clears every balance.
 *
 * Finding the true minimum is the partition problem, so we search exhaustively
 * for small groups (which is nearly all of them) and fall back to a greedy
 * largest-debtor/largest-creditor pairing beyond that. Both produce a valid
 * settlement; only the transaction count can differ.
 *
 * Several plans usually tie on payment count, so the search breaks ties by
 * moving the least money in total. That's what stops it settling A→B→C when
 * the debts cancel directly, which would make B handle cash for a debt they
 * had nothing to do with.
 */
export function settle(balances: Balance[]): Payment[] {
  const active = balances.filter((b) => b.amount !== 0);
  if (active.length === 0) return [];

  return active.length <= EXACT_SEARCH_LIMIT ? settleExact(active) : settleGreedy(active);
}

function settleExact(active: Balance[]): Payment[] {
  // The fewest payments that can clear k people is k minus the number of
  // subgroups whose balances already cancel among themselves, so the job is to
  // split the group into as many zero-sum subgroups as possible. Each subgroup
  // is then settled on its own, which is what keeps one person's debt from
  // being routed through somebody it has nothing to do with.
  const n = active.length;
  const amounts = active.map((b) => b.amount);
  const full = (1 << n) - 1;

  const sums = new Array<number>(1 << n).fill(0);
  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask;
    sums[mask] = sums[mask ^ low] + amounts[Math.log2(low) | 0];
  }

  // parts[mask] = most zero-sum subgroups `mask` can be split into, or -1 if it
  // can't be split into zero-sum subgroups at all.
  const parts = new Array<number>(1 << n).fill(-1);
  const pick = new Array<number>(1 << n).fill(0);
  parts[0] = 0;

  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask;
    // Every subgroup must contain the lowest member of `mask`, which keeps each
    // partition from being counted once per ordering.
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if ((sub & low) === 0) continue;
      if (sums[sub] !== 0) continue;
      const rest = parts[mask ^ sub];
      if (rest >= 0 && rest + 1 > parts[mask]) {
        parts[mask] = rest + 1;
        pick[mask] = sub;
      }
    }
  }

  // The balances always sum to zero, so the whole group is at worst one subgroup.
  if (parts[full] < 0) return settleGreedy(active);

  const payments: Payment[] = [];
  for (let mask = full; mask > 0; ) {
    const sub = pick[mask];
    const members: Balance[] = [];
    for (let i = 0; i < n; i++) {
      if (sub & (1 << i)) members.push(active[i]);
    }
    payments.push(...settleGreedy(members));
    mask ^= sub;
  }
  return payments;
}

function settleGreedy(active: Balance[]): Payment[] {
  const debtors = active
    .filter((b) => b.amount < 0)
    .map((b) => ({ id: b.memberId, amount: -b.amount }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const creditors = active
    .filter((b) => b.amount > 0)
    .map((b) => ({ id: b.memberId, amount: b.amount }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const payments: Payment[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amount, creditors[c].amount);
    if (amount > 0) {
      payments.push({ fromId: debtors[d].id, toId: creditors[c].id, amount });
      debtors[d].amount -= amount;
      creditors[c].amount -= amount;
    }
    if (debtors[d].amount === 0) d++;
    if (creditors[c].amount === 0) c++;
  }
  return payments;
}
