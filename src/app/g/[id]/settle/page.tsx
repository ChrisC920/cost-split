"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { AppBar } from "@/components/AppBar";
import { GroupGate } from "@/components/GroupGate";
import { Money } from "@/components/Money";
import { Avatar, Banner, Button, Card, EmptyState, LinkButton, Screen } from "@/components/ui";
import { newId } from "@/lib/id";
import { computeBalances, settle, type Payment } from "@/lib/settle";
import { useStore } from "@/lib/store";
import type { Group } from "@/lib/types";
import { useGroup } from "@/lib/useGroup";

export default function SettlePage() {
  const { group, ready, missing } = useGroup();
  return (
    <GroupGate ready={ready} missing={missing}>
      {group ? <SettleView group={group} /> : null}
    </GroupGate>
  );
}

function SettleView({ group }: { group: Group }) {
  const { addEntry } = useStore();
  const router = useRouter();

  const { balances, issues } = useMemo(() => computeBalances(group), [group]);
  const payments = useMemo(() => settle(balances), [balances]);

  const nameOf = (id: string) => group.members.find((m) => m.id === id)?.name ?? "Someone";
  const memberOf = (id: string) => group.members.find((m) => m.id === id);

  /** Log the payment as a transfer so the balances actually clear. */
  const markPaid = (payment: Payment) => {
    const now = Date.now();
    const local = new Date(now - new Date().getTimezoneOffset() * 60_000);
    addEntry(group.id, {
      kind: "transfer",
      id: newId(),
      amount: payment.amount,
      currency: group.baseCurrency,
      date: local.toISOString().slice(0, 10),
      fromId: payment.fromId,
      toId: payment.toId,
      note: "Settling up",
      createdAt: now,
      updatedAt: now,
    });
  };

  const markAllPaid = () => {
    if (!window.confirm(`Record all ${payments.length} payments as made?`)) return;
    for (const payment of payments) markPaid(payment);
    router.push(`/g/${group.id}`);
  };

  return (
    <>
      <AppBar
        title="Settle up"
        subtitle={group.name}
        back={{ href: `/g/${group.id}`, label: "Back to group" }}
      />

      <Screen>
        {issues.length > 0 ? (
          <div className="mt-4">
            <Banner tone="negative">
              {issues.length === 1 ? "One entry has" : `${issues.length} entries have`} a split that
              doesn&rsquo;t add up and {issues.length === 1 ? "is" : "are"} not counted here.
            </Banner>
          </div>
        ) : null}

        {payments.length === 0 ? (
          <Card className="mt-4">
            <EmptyState
              title={group.entries.length === 0 ? "Nothing to settle yet" : "Everyone is square"}
              body={
                group.entries.length === 0
                  ? "Once there are expenses in this group, the payback plan will show up here."
                  : "All the balances in this group net out to zero. No payments needed."
              }
              action={
                <LinkButton href={`/g/${group.id}`} variant="primary">
                  Back to {group.name}
                </LinkButton>
              }
            />
          </Card>
        ) : (
          <>
            <p className="mt-4 text-[15px] text-muted leading-relaxed">
              {payments.length === 1
                ? "One payment clears every balance in this group."
                : `${payments.length} payments clear every balance in this group — the fewest possible.`}
            </p>

            <Card className="mt-4 overflow-hidden divide-y divide-border">
              {payments.map((payment, index) => {
                const from = memberOf(payment.fromId);
                const to = memberOf(payment.toId);
                return (
                  <div key={`${payment.fromId}-${payment.toId}-${index}`} className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={from?.name ?? "?"} colorIndex={from?.colorIndex ?? 0} size={32} />
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
                        className="text-faint shrink-0" aria-hidden="true">
                        <path d="M3 9h11M10.5 5.5L14 9l-3.5 3.5" stroke="currentColor"
                          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <Avatar name={to?.name ?? "?"} colorIndex={to?.colorIndex ?? 0} size={32} />

                      <div className="min-w-0 flex-1 ml-1">
                        <p className="text-[15px] leading-tight">
                          <span className="font-medium">{nameOf(payment.fromId)}</span>
                          <span className="text-muted"> pays </span>
                          <span className="font-medium">{nameOf(payment.toId)}</span>
                        </p>
                      </div>

                      <Money minor={payment.amount} currency={group.baseCurrency} tone="plain"
                        className="font-semibold shrink-0" />
                    </div>

                    <div className="mt-3 no-print">
                      <Button size="sm" onClick={() => markPaid(payment)}>
                        Mark as paid
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Card>

            <p className="mt-3 text-[13px] text-faint leading-relaxed">
              Marking a payment as paid records it as a payback, which clears it from the balances.
            </p>

            {payments.length > 1 ? (
              <div className="mt-4 no-print">
                <Button variant="primary" onClick={markAllPaid} className="w-full">
                  Record all {payments.length} payments
                </Button>
              </div>
            ) : null}

            <div className="mt-6 no-print">
              <LinkButton href={`/g/${group.id}/report`} size="sm">
                Open the full report
              </LinkButton>
            </div>
          </>
        )}
      </Screen>
    </>
  );
}
