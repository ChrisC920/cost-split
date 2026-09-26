/**
 * Domain types for Cost Split.
 *
 * Money is never stored as a float. Every amount is an integer count of the
 * currency's minor unit (cents for USD, yen for JPY) so that repeated splitting
 * and conversion can't drift.
 */

export type SplitMode = "equal" | "shares" | "exact" | "percent";

/** One participant's stake in an expense. Meaning of `value` depends on the mode. */
export interface SplitEntry {
  memberId: string;
  /**
   * - `equal`   — ignored
   * - `shares`  — a coefficient/weight (2 = "counts double")
   * - `exact`   — minor units of the expense currency
   * - `percent` — hundredths of a percent (2500 = 25%), so 1/3 splits stay precise
   */
  value: number;
}

export interface Split {
  mode: SplitMode;
  entries: SplitEntry[];
}

export interface Member {
  id: string;
  name: string;
  /** Index into the palette in `colors.ts`. */
  colorIndex: number;
}

/** A receipt line. Several people may claim the same line and share its cost. */
export interface ReceiptItem {
  id: string;
  name: string;
  amount: number;
  memberIds: string[];
}

export const EXPENSE_CATEGORIES = [
  "general",
  "food",
  "drinks",
  "groceries",
  "lodging",
  "transport",
  "fuel",
  "tickets",
  "shopping",
  "fees",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** A cost somebody paid on behalf of a set of participants. */
export interface Expense {
  kind: "expense";
  id: string;
  title: string;
  /** Integer minor units of `currency`, always positive. */
  amount: number;
  currency: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Member who fronted the money. */
  payerId: string;
  split: Split;
  category: ExpenseCategory;
  note?: string;
  /** Key into the IndexedDB photo store, if a receipt is attached. */
  photoId?: string;
  receiptItems?: ReceiptItem[];
  createdAt: number;
  updatedAt: number;
}

/** A straight movement of money between two people: a loan, or a payback. */
export interface Transfer {
  kind: "transfer";
  id: string;
  /** Integer minor units of `currency`, always positive. */
  amount: number;
  currency: string;
  date: string;
  fromId: string;
  toId: string;
  note?: string;
  photoId?: string;
  createdAt: number;
  updatedAt: number;
}

export type Entry = Expense | Transfer;

export interface Group {
  id: string;
  name: string;
  /** Currency every balance is reported in. */
  baseCurrency: string;
  members: Member[];
  entries: Entry[];
  /**
   * Units of `baseCurrency` per 1 unit of the keyed currency.
   * The base currency itself is implicitly 1 and is not stored here.
   */
  rates: Record<string, number>;
  /** When rates were last refreshed, for showing staleness. */
  ratesUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AppData {
  version: number;
  groups: Group[];
}

export const isExpense = (e: Entry): e is Expense => e.kind === "expense";
export const isTransfer = (e: Entry): e is Transfer => e.kind === "transfer";
