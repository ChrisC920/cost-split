import type { Split, SplitEntry } from "./types";

/**
 * Distribute `total` minor units across `weights` proportionally.
 *
 * Uses the largest-remainder method: everybody gets their floor, then the
 * leftover units go to whoever was rounded down hardest. The result always sums
 * to exactly `total`, so a 10.00 dinner split three ways is 3.34/3.33/3.33
 * rather than 3.33/3.33/3.33 with a stray cent.
 */
export function distribute(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];

  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // No meaningful weights — fall back to an even spread.
    return distribute(total, new Array(n).fill(1));
  }

  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);

  const exact = weights.map((w) => (abs * w) / sum);
  const base = exact.map(Math.floor);
  let remaining = abs - base.reduce((a, b) => a + b, 0);

  // Hand out leftover units by descending fractional part; ties go to the
  // earlier participant so the same input always produces the same output.
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (let i = 0; remaining > 0 && i < order.length; i++, remaining--) {
    base[order[i].index] += 1;
  }
  // With more leftover units than participants (only possible on absurd input),
  // keep cycling so nothing is dropped.
  let cursor = 0;
  while (remaining > 0) {
    base[order[cursor % order.length].index] += 1;
    cursor++;
    remaining--;
  }

  return base.map((v) => v * sign);
}

export interface ShareResult {
  /** memberId -> minor units owed for this expense. */
  shares: Map<string, number>;
  /** Set when the split can't be applied as written. */
  error?: string;
}

/**
 * Work out what each participant owes for an expense of `total` minor units.
 *
 * `exact` and `percent` are validated rather than silently rescaled — a split
 * that doesn't add up is a data-entry mistake the user should see.
 */
export function computeShares(total: number, split: Split): ShareResult {
  const entries = split.entries;
  const shares = new Map<string, number>();

  if (entries.length === 0) {
    return { shares, error: "No one is taking part in this expense." };
  }

  const amounts = allocate(total, split, entries);
  if (typeof amounts === "string") return { shares, error: amounts };

  entries.forEach((entry, i) => {
    shares.set(entry.memberId, (shares.get(entry.memberId) ?? 0) + amounts[i]);
  });
  return { shares };
}

function allocate(total: number, split: Split, entries: SplitEntry[]): number[] | string {
  switch (split.mode) {
    case "equal":
      return distribute(total, new Array(entries.length).fill(1));

    case "shares": {
      const weights = entries.map((e) => Math.max(0, e.value));
      if (weights.every((w) => w === 0)) return "Give at least one person a share.";
      return distribute(total, weights);
    }

    case "percent": {
      // Values are hundredths of a percent, so 100% is 10000.
      const weights = entries.map((e) => Math.max(0, e.value));
      const sum = weights.reduce((a, b) => a + b, 0);
      if (sum !== 10000) {
        return `Percentages add up to ${(sum / 100).toFixed(2)}%, not 100%.`;
      }
      return distribute(total, weights);
    }

    case "exact": {
      const values = entries.map((e) => e.value);
      const sum = values.reduce((a, b) => a + b, 0);
      if (sum !== total) return "The amounts entered don't add up to the total.";
      return values;
    }
  }
}

/** A split where everyone listed pays the same share. */
export function equalSplit(memberIds: string[]): Split {
  return { mode: "equal", entries: memberIds.map((memberId) => ({ memberId, value: 0 })) };
}
