"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Money } from "@/components/Money";
import { Button, Card, Field, Input, LinkButton, Screen, Select } from "@/components/ui";
import { COMMON_CURRENCIES } from "@/lib/currencies";
import { useStore } from "@/lib/store";
import { summarize } from "@/lib/summary";

export default function HomePage() {
  const { data, ready, error, dismissError } = useStore();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <header className="no-print border-b border-border bg-bg/85 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto w-full max-w-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Logo />
            <h1 className="font-semibold text-[17px]">Cost Split</h1>
          </div>
          {data.groups.length > 0 ? (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              New group
            </Button>
          ) : null}
        </div>
      </header>

      <Screen>
        {error ? (
          <div className="mt-4 rounded-xl bg-negative-soft text-negative px-3.5 py-3 text-sm flex items-start gap-3">
            <span className="flex-1">{error}</span>
            <button onClick={dismissError} className="font-medium underline underline-offset-2">
              Dismiss
            </button>
          </div>
        ) : null}

        {creating ? <CreateGroupForm onClose={() => setCreating(false)} /> : null}

        {!ready ? (
          <div className="mt-6 space-y-3" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-surface-2 animate-pulse" />
            ))}
          </div>
        ) : data.groups.length === 0 ? (
          !creating ? <Landing onStart={() => setCreating(true)} /> : null
        ) : (
          <ul className="mt-5 space-y-3">
            {data.groups.map((group) => {
              const summary = summarize(group);
              return (
                <li key={group.id}>
                  <Link href={`/g/${group.id}`} className="block group">
                    <Card className="p-4 transition-colors group-hover:border-border-strong">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{group.name}</p>
                          <p className="text-[13px] text-muted mt-0.5">
                            {summary.memberCount} {summary.memberCount === 1 ? "person" : "people"}
                            {" · "}
                            {summary.entryCount} {summary.entryCount === 1 ? "entry" : "entries"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <Money minor={summary.total} currency={group.baseCurrency} tone="plain" className="font-semibold" />
                          <p className="text-[13px] mt-0.5">
                            {summary.entryCount === 0 ? (
                              <span className="text-faint">No spending yet</span>
                            ) : summary.unsettled ? (
                              <span className="text-warn">Not settled up</span>
                            ) : (
                              <span className="text-positive">Settled up</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {ready && data.groups.length > 0 ? (
          <p className="text-[13px] text-faint text-center mt-8 leading-relaxed">
            Groups are stored in this browser only.{" "}
            <Link href="/about" className="underline underline-offset-2 hover:text-muted">
              How this works
            </Link>
          </p>
        ) : null}
      </Screen>
    </>
  );
}

function Logo() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5v13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".6" strokeDasharray="2 1.8" />
        <circle cx="4.6" cy="6" r="2" fill="currentColor" />
        <circle cx="11.4" cy="10" r="2" fill="currentColor" opacity=".75" />
      </svg>
    </span>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  const features = [
    ["Split unevenly", "Equal shares, coefficients, exact amounts or percentages."],
    ["Settle in the fewest payments", "The payback plan nets everyone out and minimises transfers."],
    ["Any currency", "Log costs as you paid them; balances convert to the group's currency."],
    ["Loans and paybacks", "Record money moving between two people, not just shared costs."],
    ["Receipts", "Attach a photo to any expense."],
    ["Offline, no account", "Everything runs in your browser and keeps working with no signal."],
  ];

  return (
    <div className="pt-10 pb-4">
      <h2 className="text-[28px] leading-tight font-semibold tracking-tight">
        Share costs with a group, then settle up cleanly.
      </h2>
      <p className="text-muted mt-3 leading-relaxed">
        Keep track of who paid for what on a trip, in a flat share, or over a long weekend —
        then find out who owes whom, in as few payments as possible.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="primary" size="lg" onClick={onStart}>
          Start a group
        </Button>
        <LinkButton href="/about" size="lg">
          How it works
        </LinkButton>
      </div>

      <dl className="mt-10 grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {features.map(([title, body]) => (
          <div key={title}>
            <dt className="font-medium text-[15px]">{title}</dt>
            <dd className="text-sm text-muted mt-1 leading-relaxed">{body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CreateGroupForm({ onClose }: { onClose: () => void }) {
  const { createGroup } = useStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [names, setNames] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const memberNames = names
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean);
    const group = createGroup({ name, baseCurrency: currency, memberNames });
    router.push(`/g/${group.id}`);
  };

  return (
    <Card className="mt-5 p-4">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Group name">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lisbon trip"
            maxLength={80}
          />
        </Field>

        <Field label="Group currency" hint="Balances and the payback plan are shown in this currency.">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {COMMON_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="People" hint="One per line, or separated by commas. You can add more later.">
          <textarea
            value={names}
            onChange={(e) => setNames(e.target.value)}
            rows={4}
            placeholder={"Ana\nBen\nChris"}
            className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 placeholder:text-faint focus:border-accent focus:outline-none transition-colors resize-y"
          />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" className="flex-1">
            Create group
          </Button>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
