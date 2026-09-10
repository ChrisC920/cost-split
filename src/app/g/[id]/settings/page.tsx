"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppBar } from "@/components/AppBar";
import { GroupGate } from "@/components/GroupGate";
import { Avatar, Banner, Button, Card, Field, Input, Screen, Select } from "@/components/ui";
import { MEMBER_COLORS } from "@/lib/colors";
import { COMMON_CURRENCIES, fetchRates } from "@/lib/currencies";
import { downloadText, exportGroupJson, parseGroupJson, safeFilename } from "@/lib/export";
import { computeBalances } from "@/lib/settle";
import { useStore } from "@/lib/store";
import { currenciesUsed } from "@/lib/summary";
import type { Group } from "@/lib/types";
import { useGroup } from "@/lib/useGroup";

export default function SettingsPage() {
  const { group, ready, missing } = useGroup();
  return (
    <GroupGate ready={ready} missing={missing}>
      {group ? <SettingsView group={group} /> : null}
    </GroupGate>
  );
}

function SettingsView({ group }: { group: Group }) {
  const { updateGroup, deleteGroup, addMember, updateMember, removeMember, importGroup } = useStore();
  const router = useRouter();

  const [newMember, setNewMember] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  const { balances } = computeBalances(group);
  const balanceOf = (memberId: string) =>
    balances.find((b) => b.memberId === memberId)?.amount ?? 0;

  const usedBy = (memberId: string) =>
    group.entries.some((entry) =>
      entry.kind === "transfer"
        ? entry.fromId === memberId || entry.toId === memberId
        : entry.payerId === memberId || entry.split.entries.some((s) => s.memberId === memberId),
    );

  const foreign = currenciesUsed(group).filter((c) => c !== group.baseCurrency.toUpperCase());

  const refreshRates = async () => {
    setFetching(true);
    setProblem(null);
    setNotice(null);
    const result = await fetchRates(group.baseCurrency, foreign);
    setFetching(false);

    if ("error" in result) {
      setProblem(result.error);
      return;
    }
    updateGroup(group.id, {
      rates: { ...group.rates, ...result.rates },
      ratesUpdatedAt: Date.now(),
    });
    setNotice("Exchange rates updated.");
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setNotice(null);
    try {
      const imported = parseGroupJson(await file.text());
      if (!imported) {
        setProblem("That file isn't a Cost Split group export.");
        return;
      }
      const created = importGroup(imported);
      router.push(`/g/${created.id}`);
    } catch {
      setProblem("Couldn't read that file.");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  const removeGroup = () => {
    if (!window.confirm(`Delete "${group.name}" and all of its entries? This can't be undone.`)) return;
    deleteGroup(group.id);
    router.push("/");
  };

  const tryRemoveMember = (memberId: string, name: string) => {
    if (usedBy(memberId)) {
      setProblem(
        `${name} appears in entries in this group. Remove or reassign those entries first.`,
      );
      return;
    }
    removeMember(group.id, memberId);
    setProblem(null);
  };

  return (
    <>
      <AppBar
        title="Group settings"
        subtitle={group.name}
        back={{ href: `/g/${group.id}`, label: "Back to group" }}
      />

      <Screen>
        {problem ? (
          <div className="mt-4">
            <Banner tone="negative">{problem}</Banner>
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4">
            <Banner tone="accent">{notice}</Banner>
          </div>
        ) : null}

        <Card className="mt-4 p-4 space-y-4">
          <Field label="Group name">
            <Input
              value={group.name}
              onChange={(e) => updateGroup(group.id, { name: e.target.value })}
              maxLength={80}
            />
          </Field>
          <Field
            label="Group currency"
            hint="Balances and the payback plan are shown in this currency. Existing entries keep the currency they were logged in."
          >
            <Select
              value={group.baseCurrency}
              onChange={(e) => updateGroup(group.id, { baseCurrency: e.target.value.toUpperCase() })}
            >
              {[group.baseCurrency, ...COMMON_CURRENCIES.map((c) => c.code)]
                .filter((code, i, all) => all.indexOf(code) === i)
                .map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
            </Select>
          </Field>
        </Card>

        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint mt-6 mb-2 px-1">
          People
        </h2>
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {group.members.map((member) => {
              const balance = balanceOf(member.id);
              return (
                <li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateMember(group.id, member.id, {
                        colorIndex: (member.colorIndex + 1) % MEMBER_COLORS.length,
                      })
                    }
                    aria-label={`Change ${member.name}'s colour`}
                    className="shrink-0"
                  >
                    <Avatar name={member.name} colorIndex={member.colorIndex} size={34} />
                  </button>

                  <input
                    value={member.name}
                    onChange={(e) => updateMember(group.id, member.id, { name: e.target.value })}
                    aria-label={`Name for ${member.name}`}
                    maxLength={40}
                    className="min-w-0 flex-1 bg-transparent border-none px-0 py-1 text-[15px] focus:outline-none focus:border-none"
                  />

                  <button
                    type="button"
                    onClick={() => tryRemoveMember(member.id, member.name)}
                    aria-label={`Remove ${member.name}`}
                    disabled={balance !== 0}
                    title={balance !== 0 ? "This person has an unsettled balance." : undefined}
                    className="p-2 rounded-lg text-faint hover:text-negative hover:bg-negative-soft transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"
                        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (addMember(group.id, newMember)) setNewMember("");
            }}
            className="flex gap-2 p-3 border-t border-border"
          >
            <Input
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              placeholder="Add someone"
              maxLength={40}
              aria-label="Name of the person to add"
            />
            <Button type="submit" variant="primary" disabled={!newMember.trim()}>
              Add
            </Button>
          </form>
        </Card>
        {group.members.length === 0 ? (
          <p className="text-[13px] text-faint mt-2 px-1">
            Add at least one person before logging an expense.
          </p>
        ) : null}

        {foreign.length > 0 ? (
          <>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-faint mt-6 mb-2 px-1">
              Exchange rates
            </h2>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {foreign.map((code) => (
                  <li key={code} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[15px] w-14 shrink-0">1 {code}</span>
                    <span className="text-muted text-[15px] shrink-0">=</span>
                    <Input
                      inputMode="decimal"
                      value={String(group.rates[code] ?? "")}
                      onChange={(e) => {
                        const parsed = Number(e.target.value.replace(",", "."));
                        updateGroup(group.id, {
                          rates: {
                            ...group.rates,
                            [code]: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
                          },
                        });
                      }}
                      placeholder="1.00"
                      aria-label={`Rate for ${code} in ${group.baseCurrency}`}
                      className="tnum text-right min-h-9 py-1.5"
                    />
                    <span className="text-[15px] text-muted w-12 shrink-0">
                      {group.baseCurrency}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="p-3 border-t border-border flex items-center gap-3 flex-wrap">
                <Button size="sm" onClick={() => void refreshRates()} disabled={fetching}>
                  {fetching ? "Fetching…" : "Fetch current rates"}
                </Button>
                <span className="text-[13px] text-faint">
                  {group.ratesUpdatedAt
                    ? `Updated ${new Date(group.ratesUpdatedAt).toLocaleDateString()}`
                    : "Not fetched yet"}
                </span>
              </div>
            </Card>
            <p className="text-[13px] text-faint mt-2 px-1 leading-relaxed">
              A rate of 0 or 1 means amounts in that currency are counted at face value.
            </p>
          </>
        ) : null}

        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint mt-6 mb-2 px-1">
          Move this group
        </h2>
        <Card className="p-4">
          <p className="text-[15px] text-muted leading-relaxed">
            Export the group as a file to back it up or open it on another device. Photos stay on
            this device.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() =>
                downloadText(
                  `${safeFilename(group.name)}.costsplit.json`,
                  exportGroupJson(group),
                  "application/json",
                )
              }
            >
              Export group
            </Button>
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => void handleImport(e.target.files?.[0])}
            />
            <Button onClick={() => importInput.current?.click()}>Import a group file</Button>
          </div>
        </Card>

        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint mt-6 mb-2 px-1">
          Danger zone
        </h2>
        <Card className="p-4">
          <p className="text-[15px] text-muted leading-relaxed">
            Deleting removes the group, its entries and its receipts from this browser for good.
          </p>
          <div className="mt-3">
            <Button variant="danger" onClick={removeGroup}>
              Delete this group
            </Button>
          </div>
        </Card>

        <div className="h-8" />
      </Screen>
    </>
  );
}
