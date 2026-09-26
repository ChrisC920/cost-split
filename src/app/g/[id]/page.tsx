"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppBar } from "@/components/AppBar";
import { EntryRow } from "@/components/EntryRow";
import { GroupGate } from "@/components/GroupGate";
import { Money } from "@/components/Money";
import { Avatar, Banner, Card, EmptyState, LinkButton, Screen, Segmented } from "@/components/ui";
import { convert } from "@/lib/money";
import { cloudEnabled } from "@/lib/cloud";
import { computeBalances, settle } from "@/lib/settle";
import { useGroup } from "@/lib/useGroup";
import type { Entry, Group } from "@/lib/types";

type Tab = "entries" | "balances";

export default function GroupPage() {
  const { group, ready, missing } = useGroup();
  const [tab, setTab] = useState<Tab>("entries");

  return (
    <GroupGate ready={ready} missing={missing}>
      {group ? <GroupView group={group} tab={tab} onTab={setTab} /> : null}
    </GroupGate>
  );
}

function GroupView({ group, tab, onTab }: { group: Group; tab: Tab; onTab: (t: Tab) => void }) {
  const { balances, issues } = useMemo(() => computeBalances(group), [group]);
  const payments = useMemo(() => settle(balances), [balances]);

  const total = useMemo(
    () =>
      group.entries
        .filter((e) => e.kind === "expense")
        .reduce(
          (sum, e) =>
            sum + convert(e.amount, e.currency, group.baseCurrency, group.baseCurrency, group.rates),
          0,
        ),
    [group],
  );

  const byDate = useMemo(() => groupByDate(group.entries), [group.entries]);
  const noMembers = group.members.length === 0;

  return (
    <>
      <AppBar
        title={group.name}
        subtitle={`${group.members.length} ${group.members.length === 1 ? "person" : "people"} · ${group.baseCurrency}`}
        back={{ href: "/", label: "Back to groups" }}
        action={
          <Link
            href={`/g/${group.id}/settings`}
            aria-label="Group settings"
            className="p-2 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M10 2.5v1.8M10 15.7v1.8M17.5 10h-1.8M4.3 10H2.5M15.3 4.7l-1.3 1.3M6 14l-1.3 1.3M15.3 15.3L14 14M6 6L4.7 4.7"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </Link>
        }
      />

      <Screen>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Card className="p-3.5">
            <p className="text-[13px] text-muted">Total spent</p>
            <Money minor={total} currency={group.baseCurrency} tone="plain" className="text-xl font-semibold block mt-0.5" />
          </Card>
          <Card className="p-3.5">
            <p className="text-[13px] text-muted">To settle up</p>
            <p className="text-xl font-semibold mt-0.5">
              {payments.length === 0 ? (
                <span className="text-positive">All square</span>
              ) : (
                <>
                  {payments.length}{" "}
                  <span className="text-base font-normal text-muted">
                    {payments.length === 1 ? "payment" : "payments"}
                  </span>
                </>
              )}
            </p>
          </Card>
        </div>

        {issues.length > 0 ? (
          <div className="mt-3">
            <Banner tone="negative">
              {issues.length === 1 ? "One entry has" : `${issues.length} entries have`} a split that
              doesn&rsquo;t add up, so {issues.length === 1 ? "it is" : "they are"} left out of the
              balances. Open {issues.length === 1 ? "it" : "them"} to fix the amounts.
            </Banner>
          </div>
        ) : null}

        {noMembers ? (
          <div className="mt-3">
            <Banner>
              Add some people to this group before you can log an expense.{" "}
              <Link href={`/g/${group.id}/settings`} className="underline underline-offset-2 font-medium">
                Add people
              </Link>
            </Banner>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2 no-print">
          <LinkButton
            href={`/g/${group.id}/receipt/new`}
            variant="primary"
            className={noMembers ? "flex-1 pointer-events-none opacity-45" : "flex-1"}
          >
            Scan receipt
          </LinkButton>
          <LinkButton
            href={`/g/${group.id}/entry/new`}
            className={noMembers ? "flex-1 pointer-events-none opacity-45" : "flex-1"}
          >
            Add expense
          </LinkButton>
        </div>
        {cloudEnabled ? <p className="mt-2 text-sm text-muted no-print">
          Each person can pick items on their phone. <Link className="text-accent underline underline-offset-2" href={`/g/${group.id}/settings`}>Copy the invite link</Link>
        </p> : null}

        <div className="mt-5 no-print">
          <Segmented
            label="View"
            value={tab}
            onChange={onTab}
            options={[
              { value: "entries", label: `Entries${group.entries.length ? ` (${group.entries.length})` : ""}` },
              { value: "balances", label: "Balances" },
            ]}
          />
        </div>

        {tab === "entries" ? (
          <div className="mt-4">
            {group.entries.length === 0 ? (
              <Card>
                <EmptyState
                  title="Nothing logged yet"
                  body="Scan a receipt or add an expense to get started."
                  action={
                    noMembers ? undefined : (
                      <LinkButton href={`/g/${group.id}/receipt/new`} variant="primary">
                        Scan a receipt
                      </LinkButton>
                    )
                  }
                />
              </Card>
            ) : (
              <div className="space-y-4">
                {byDate.map(([date, entries]) => (
                  <div key={date}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-1.5 px-1">
                      {formatDateHeading(date)}
                    </p>
                    <Card className="overflow-hidden divide-y divide-border">
                      {entries.map((entry) => (
                        <EntryRow key={entry.id} group={group} entry={entry} />
                      ))}
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4">
            {group.members.length === 0 ? (
              <Card>
                <EmptyState title="No one in this group yet" body="Add people in settings to start tracking balances." />
              </Card>
            ) : (
              <Card className="overflow-hidden divide-y divide-border">
                {[...balances]
                  .sort((a, b) => b.amount - a.amount)
                  .map((balance) => {
                    const member = group.members.find((m) => m.id === balance.memberId);
                    if (!member) return null;
                    return (
                      <div key={balance.memberId} className="flex items-center gap-3 px-4 py-3">
                        <Avatar name={member.name} colorIndex={member.colorIndex} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-[15px]">{member.name}</p>
                          <p className="text-[13px] text-muted tnum">
                            paid {formatPlain(balance.paid, group.baseCurrency)} · share{" "}
                            {formatPlain(balance.share, group.baseCurrency)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <Money minor={balance.amount} currency={group.baseCurrency} signed className="font-semibold" />
                          <p className="text-[13px] text-faint">
                            {balance.amount === 0 ? "settled" : balance.amount > 0 ? "is owed" : "owes"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </Card>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2 no-print">
          <LinkButton href={`/g/${group.id}/settle`} size="sm">Settle up</LinkButton>
          <LinkButton href={`/g/${group.id}/entry/new?kind=transfer`} size="sm"
            className={noMembers ? "pointer-events-none opacity-45" : undefined}>
            Record a payback
          </LinkButton>
          <LinkButton href={`/g/${group.id}/report`} size="sm">
            Report
          </LinkButton>
          <LinkButton href={`/g/${group.id}/settings`} size="sm">
            Settings
          </LinkButton>
        </div>
      </Screen>
    </>
  );
}

function formatPlain(minor: number, currency: string): string {
  const decimals = currency.toUpperCase() === "JPY" ? 0 : 2;
  return (minor / 10 ** decimals).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Newest day first, and newest entry first within a day. */
function groupByDate(entries: Entry[]): [string, Entry[]][] {
  const buckets = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = buckets.get(entry.date);
    if (list) list.push(entry);
    else buckets.set(entry.date, [entry]);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => [date, [...list].sort((a, b) => b.createdAt - a.createdAt)] as [string, Entry[]]);
}

function formatDateHeading(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((startOfToday.getTime() - date.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}
