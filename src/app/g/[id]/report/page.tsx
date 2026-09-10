"use client";

import { useMemo } from "react";
import { AppBar } from "@/components/AppBar";
import { formatDay } from "@/components/EntryRow";
import { GroupGate } from "@/components/GroupGate";
import { Money } from "@/components/Money";
import { Button, Card, EmptyState, LinkButton, Screen } from "@/components/ui";
import { categoryTotals, currencyTotals, personSummaries } from "@/lib/exchange";
import { downloadText, exportGroupCsv, safeFilename } from "@/lib/export";
import { formatAmount } from "@/lib/money";
import { computeBalances, settle } from "@/lib/settle";
import { computeShares } from "@/lib/split";
import type { Group } from "@/lib/types";
import { useGroup } from "@/lib/useGroup";

export default function ReportPage() {
  const { group, ready, missing } = useGroup();
  return (
    <GroupGate ready={ready} missing={missing}>
      {group ? <ReportView group={group} /> : null}
    </GroupGate>
  );
}

function ReportView({ group }: { group: Group }) {
  const people = useMemo(() => personSummaries(group), [group]);
  const categories = useMemo(() => categoryTotals(group), [group]);
  const currencies = useMemo(() => currencyTotals(group), [group]);
  const payments = useMemo(() => settle(computeBalances(group).balances), [group]);

  const base = group.baseCurrency;
  const total = categories.reduce((sum, c) => sum + c.total, 0);
  const nameOf = (id: string) => group.members.find((m) => m.id === id)?.name ?? "Someone";

  const entries = useMemo(
    () => [...group.entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
    [group.entries],
  );

  if (group.entries.length === 0) {
    return (
      <>
        <AppBar title="Report" subtitle={group.name} back={{ href: `/g/${group.id}`, label: "Back to group" }} />
        <Screen>
          <Card className="mt-4">
            <EmptyState
              title="Nothing to report yet"
              body="Add a few expenses and the full breakdown will appear here, ready to print or export."
              action={
                <LinkButton href={`/g/${group.id}`} variant="primary">
                  Back to {group.name}
                </LinkButton>
              }
            />
          </Card>
        </Screen>
      </>
    );
  }

  return (
    <>
      <AppBar
        title="Report"
        subtitle={group.name}
        back={{ href: `/g/${group.id}`, label: "Back to group" }}
        action={
          <Button size="sm" onClick={() => window.print()}>
            Print
          </Button>
        }
      />

      <Screen>
        <div className="mt-5">
          <h2 className="text-xl font-semibold">{group.name}</h2>
          <p className="text-[13px] text-muted mt-0.5">
            {group.members.length} {group.members.length === 1 ? "person" : "people"} ·{" "}
            {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"} · totals in {base}
          </p>
        </div>

        <Section title="Total">
          <div className="px-4 py-4">
            <Money minor={total} currency={base} tone="plain" className="text-2xl font-semibold" />
            {group.members.length > 0 ? (
              <p className="text-[13px] text-muted mt-1 tnum">
                {formatAmount(Math.round(total / group.members.length), base)} {base} per person
              </p>
            ) : null}
          </div>
        </Section>

        <Section title="Per person">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="text-[13px] text-faint">
                <th className="text-left font-medium px-4 py-2">Person</th>
                <th className="text-right font-medium px-2 py-2">Paid</th>
                <th className="text-right font-medium px-2 py-2">Share</th>
                <th className="text-right font-medium px-4 py-2">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {people.map((person) => (
                <tr key={person.memberId}>
                  <td className="px-4 py-2.5 truncate max-w-[10rem]">{person.name}</td>
                  <td className="px-2 py-2.5 text-right tnum text-muted">
                    {formatAmount(person.paid, base)}
                  </td>
                  <td className="px-2 py-2.5 text-right tnum text-muted">
                    {formatAmount(person.share, base)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money minor={person.balance} currency={base} signed className="font-medium" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Payback plan">
          {payments.length === 0 ? (
            <p className="px-4 py-4 text-[15px] text-positive">Everyone is settled up.</p>
          ) : (
            <ol className="divide-y divide-border">
              {payments.map((payment, index) => (
                <li key={index} className="px-4 py-2.5 flex items-center justify-between gap-3 text-[15px]">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{nameOf(payment.fromId)}</span>
                    <span className="text-muted"> pays </span>
                    <span className="font-medium">{nameOf(payment.toId)}</span>
                  </span>
                  <Money minor={payment.amount} currency={base} tone="plain" className="font-medium shrink-0" />
                </li>
              ))}
            </ol>
          )}
        </Section>

        {categories.length > 1 ? (
          <Section title="By category">
            <ul className="divide-y divide-border">
              {categories.map((row) => (
                <li key={row.category} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3 text-[15px]">
                    <span className="capitalize">{row.category}</span>
                    <span className="tnum shrink-0">
                      {formatAmount(row.total, base)}
                      <span className="text-muted text-[13px] ml-2">
                        {Math.round((row.total / total) * 100)}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full bg-accent"
                      style={{ width: `${total > 0 ? (row.total / total) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {currencies.length > 1 ? (
          <Section title="Currencies">
            <ul className="divide-y divide-border">
              {currencies.map((row) => (
                <li key={row.currency} className="px-4 py-2.5 flex items-center justify-between gap-3 text-[15px]">
                  <span>
                    {row.currency}
                    {row.currency !== base.toUpperCase() ? (
                      <span className="text-[13px] text-muted ml-2 tnum">
                        1 = {row.rate.toPrecision(6).replace(/\.?0+$/, "")} {base}
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted ml-2">group currency</span>
                    )}
                  </span>
                  <span className="tnum shrink-0 text-right">
                    {formatAmount(row.total, row.currency)}
                    {row.currency !== base.toUpperCase() ? (
                      <span className="text-[13px] text-muted block">
                        = {formatAmount(row.inBase, base)} {base}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title="All entries">
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              if (entry.kind === "transfer") {
                return (
                  <li key={entry.id} className="px-4 py-2.5 text-[15px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {nameOf(entry.fromId)} → {nameOf(entry.toId)}
                      </span>
                      <span className="tnum shrink-0">
                        {formatAmount(entry.amount, entry.currency)} {entry.currency}
                      </span>
                    </div>
                    <p className="text-[13px] text-muted">{formatDay(entry.date)} · payback</p>
                  </li>
                );
              }
              const { shares, error } = computeShares(entry.amount, entry.split);
              return (
                <li key={entry.id} className="px-4 py-2.5 text-[15px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{entry.title}</span>
                    <span className="tnum shrink-0">
                      {formatAmount(entry.amount, entry.currency)} {entry.currency}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted">
                    {formatDay(entry.date)} · {nameOf(entry.payerId)} paid
                  </p>
                  {error ? (
                    <p className="text-[13px] text-negative mt-0.5">
                      Split doesn&rsquo;t add up — not counted in the totals.
                    </p>
                  ) : (
                    <p className="text-[13px] text-faint mt-0.5 tnum">
                      {[...shares.entries()]
                        .map(([id, share]) => `${nameOf(id)} ${formatAmount(share, entry.currency)}`)
                        .join(" · ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        <div className="mt-6 flex flex-wrap gap-2 no-print">
          <Button
            onClick={() =>
              downloadText(`${safeFilename(group.name)}-expenses.csv`, exportGroupCsv(group), "text/csv")
            }
          >
            Download CSV
          </Button>
          <Button onClick={() => window.print()}>Print or save as PDF</Button>
        </div>
      </Screen>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-faint mb-2 px-1">{title}</h3>
      <Card className="overflow-hidden">{children}</Card>
    </section>
  );
}
