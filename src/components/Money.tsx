"use client";

import { formatAmount } from "@/lib/money";
import { cx } from "./ui";

/**
 * A money value, coloured by sign when it represents a balance.
 *
 * `signed` adds an explicit + so a credit reads unambiguously next to a debit.
 */
export function Money({
  minor,
  currency,
  signed = false,
  tone = "auto",
  className,
}: {
  minor: number;
  currency: string;
  signed?: boolean;
  tone?: "auto" | "plain";
  className?: string;
}) {
  const color =
    tone === "plain" || minor === 0
      ? ""
      : minor > 0
        ? "text-positive"
        : "text-negative";

  const prefix = signed && minor > 0 ? "+" : "";

  return (
    <span className={cx("tnum whitespace-nowrap", color, className)}>
      {prefix}
      {formatAmount(minor, currency)}
      <span className="text-[0.8em] opacity-60 ml-1">{currency.toUpperCase()}</span>
    </span>
  );
}
