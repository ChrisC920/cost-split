"use client";

import Link from "next/link";
import { Money } from "./Money";
import { Avatar } from "./ui";
import { computeShares } from "@/lib/split";
import type { Entry, Group } from "@/lib/types";

const CATEGORY_ICONS: Record<string, string> = {
  general: "•",
  food: "🍽",
  drinks: "🍺",
  groceries: "🛒",
  lodging: "🛏",
  transport: "🚕",
  fuel: "⛽",
  tickets: "🎟",
  shopping: "🛍",
  fees: "🧾",
};

export function EntryRow({ group, entry }: { group: Group; entry: Entry }) {
  const nameOf = (id: string) => group.members.find((m) => m.id === id)?.name ?? "Someone";
  const memberOf = (id: string) => group.members.find((m) => m.id === id);

  if (entry.kind === "transfer") {
    const from = memberOf(entry.fromId);
    const to = memberOf(entry.toId);
    return (
      <Link
        href={`/g/${group.id}/entry/${entry.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 6.5h10M10.5 4l2.5 2.5L10.5 9M15 11.5H5M7.5 9L5 11.5 7.5 14"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-medium truncate text-[15px]">
            {from?.name ?? "Someone"} paid {to?.name ?? "someone"} back
          </p>
          <p className="text-[13px] text-muted truncate">
            {entry.note ? entry.note : "payback"}
          </p>
        </div>

        <div className="text-right shrink-0">
          <Money minor={entry.amount} currency={entry.currency} tone="plain" className="font-medium" />
          <p className="text-[13px] text-faint">transfer</p>
        </div>
      </Link>
    );
  }

  const { error } = computeShares(entry.amount, entry.split);
  const participants = entry.split.entries.length;
  const payer = memberOf(entry.payerId);

  return (
    <Link
      href={`/g/${group.id}/entry/${entry.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-base"
      >
        {CATEGORY_ICONS[entry.category] ?? "•"}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium truncate text-[15px]">{entry.title || "Expense"}</p>
        <p className="text-[13px] text-muted truncate">
          {nameOf(entry.payerId)} paid
          {error ? (
            <span className="text-negative"> · check this split</span>
          ) : (
            ` · split ${participants} ${participants === 1 ? "way" : "ways"}`
          )}
        </p>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {entry.photoId ? (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="text-faint" aria-label="Has a receipt">
            <rect x="1.5" y="3.5" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="8" cy="8.5" r="2.4" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        ) : null}
        <Money minor={entry.amount} currency={entry.currency} tone="plain" className="font-medium" />
        <Avatar name={payer?.name ?? "?"} colorIndex={payer?.colorIndex ?? 0} size={26} />
      </div>
    </Link>
  );
}

/** Short, human date: "Mar 14" now, "Mar 14, 2025" once the year differs. */
export function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
