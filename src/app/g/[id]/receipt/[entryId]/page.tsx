"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppBar } from "@/components/AppBar";
import { GroupGate } from "@/components/GroupGate";
import { Banner, Button, Card, Field, Input, Screen, Select } from "@/components/ui";
import { formatAmount, parseAmount } from "@/lib/money";
import { getPhoto } from "@/lib/photos";
import { cloudEnabled } from "@/lib/cloud";
import { receiptShares, receiptSplit } from "@/lib/receipt";
import { newId } from "@/lib/id";
import { useGroup } from "@/lib/useGroup";
import { useStore } from "@/lib/store";
import type { Expense, ReceiptItem } from "@/lib/types";

type DraftItem = { id: string; name: string; amount: string; memberIds: string[] };

export default function ReceiptPage() {
  const { group, ready, missing } = useGroup();
  const { entryId } = useParams<{ entryId: string }>();
  const entry = group?.entries.find((item): item is Expense => item.id === entryId && item.kind === "expense" && !!item.receiptItems);
  return <GroupGate ready={ready} missing={missing}>{group && entry ?
    <ReceiptEditor key={entry.id} groupId={group.id} entry={entry} members={group.members} /> : group ?
    <><AppBar title="Receipt not found" back={{ href: `/g/${group.id}`, label: "Back to group" }} /><Screen><p className="mt-5">This receipt is no longer in the group.</p></Screen></> : null}
  </GroupGate>;
}

function ReceiptEditor({ groupId, entry, members }: { groupId: string; entry: Expense; members: { id: string; name: string }[] }) {
  const { updateEntry, removeEntry, getIdentity, setReceiptClaim } = useStore();
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [personId, setPersonId] = useState(getIdentity(groupId) ?? members[0]?.id ?? "");
  const [title, setTitle] = useState(entry.title);
  const [amount, setAmount] = useState(formatAmount(entry.amount, entry.currency));
  const [payerId, setPayerId] = useState(entry.payerId);
  const [items, setItems] = useState<DraftItem[]>(() => (entry.receiptItems ?? []).map((item) => ({
    ...item, amount: formatAmount(item.amount, entry.currency),
  })));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    setScanError(new URLSearchParams(window.location.search).get("scanError"));
  }, []);

  useEffect(() => {
    if (entry.photoId) void getPhoto(entry.photoId).then(setPhoto);
  }, [entry.photoId]);
  useEffect(() => {
    if (cloudEnabled) {
      const identity = getIdentity(groupId);
      if (identity) setPersonId(identity);
      return;
    }
    const saved = window.localStorage.getItem(`cost-split:person:${groupId}`);
    if (saved && members.some((member) => member.id === saved)) setPersonId(saved);
  }, [groupId, members, getIdentity]);

  const selected = members.find((member) => member.id === personId);
  const parsedItems: ReceiptItem[] = items.map((item) => ({
    ...item, name: item.name.trim(), amount: parseAmount(item.amount, entry.currency) ?? 0,
  }));
  const parsedTotal = parseAmount(amount, entry.currency);
  const shares = receiptShares(parsedTotal ?? 0, parsedItems);
  const subtotal = parsedItems.reduce((sum, item) => sum + item.amount, 0);

  const save = () => {
    setError(null);
    if (!title.trim()) return setError("Enter a receipt name.");
    if (parsedTotal === null || parsedTotal <= 0) return setError("Enter a total greater than zero.");
    if (!items.length) return setError("Add at least one item.");
    if (parsedItems.some((item) => !item.name || item.amount <= 0)) return setError("Each item needs a name and price.");
    if (parsedItems.some((item) => item.memberIds.length === 0)) return setError("Every item needs at least one person.");
    updateEntry(groupId, { ...entry, title: title.trim(), amount: parsedTotal, payerId,
      receiptItems: parsedItems, split: receiptSplit(parsedTotal, parsedItems) });
    setNotice("Receipt saved.");
  };

  const toggle = async (itemId: string) => {
    setError(null);
    const currentItem = entry.receiptItems?.find((item) => item.id === itemId);
    if (!currentItem) return;
    const mine = currentItem.memberIds.includes(personId);
    if (mine && currentItem.memberIds.length === 1) {
      setError("Someone must cover this item. Ask another person to pick it first.");
      return;
    }
    if (cloudEnabled) {
      try { await setReceiptClaim(groupId, entry.id, itemId, !mine); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't save your choice."); }
      return;
    }
    const next = (entry.receiptItems ?? []).map((item) => {
      if (item.id !== itemId) return item;
      return { ...item, memberIds: mine ? item.memberIds.filter((id) => id !== personId) : [...item.memberIds, personId] };
    });
    updateEntry(groupId, { ...entry, receiptItems: next, split: receiptSplit(entry.amount, next) });
    setItems((current) => current.map((item) => {
      const saved = next.find((candidate) => candidate.id === item.id);
      return saved ? { ...item, memberIds: saved.memberIds } : item;
    }));
  };

  const remove = () => {
    if (!window.confirm("Delete this receipt and its photo?")) return;
    removeEntry(groupId, entry.id);
    router.push(`/g/${groupId}`);
  };

  return <>
    <AppBar title="Receipt" subtitle={entry.title} back={{ href: `/g/${groupId}`, label: "Back to group" }} />
    <Screen><div className="mt-4 space-y-4 pb-8">
      {scanError ? <Banner tone="warn">{scanError}</Banner> : null}
      {(entry.receiptItems?.length ?? 0) === 0 || entry.amount <= 0 ?
        <Banner tone="warn">The scanner could not find a complete item list. Use the photo below to add the items and total, then save.</Banner> : null}
      <Card className="p-4 space-y-4">
        <Field label="I am">
          {cloudEnabled ? <p className="font-medium">{selected?.name ?? "Joining group…"}</p> :
          <Select value={personId} onChange={(event) => {
            setPersonId(event.target.value);
            window.localStorage.setItem(`cost-split:person:${groupId}`, event.target.value);
          }}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select>}
        </Field>
        <p className="text-sm text-muted">Tap the items you want. Each tap saves your choice and updates the group balance.</p>
        <div className="divide-y divide-border border-y border-border">
          {(entry.receiptItems ?? []).map((item) => {
            const mine = item.memberIds.includes(personId);
            return <button key={item.id} type="button" onClick={() => void toggle(item.id)} aria-pressed={mine}
              className="w-full flex items-center gap-3 py-3 text-left">
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded border ${mine ? "bg-accent border-accent text-accent-fg" : "border-border-strong"}`}>{mine ? "✓" : ""}</span>
              <span className="flex-1 min-w-0"><span className="block font-medium truncate">{item.name}</span>
                <span className="block text-xs text-muted">{item.memberIds.map((id) => members.find((member) => member.id === id)?.name).filter(Boolean).join(", ") || "No one"}</span></span>
              <span className="tnum">{formatAmount(item.amount, entry.currency)}</span>
            </button>;
          })}
        </div>
        <p className="font-semibold">{selected?.name ?? "Your"} share: {formatAmount(shares.get(personId) ?? 0, entry.currency)} {entry.currency}</p>
      </Card>

      {photo ? <Card className="p-4"><p className="text-sm font-medium mb-2">Original receipt</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <a href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Original receipt" className="w-full max-h-96 object-contain rounded-lg" /></a>
      </Card> : null}

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Check the scanned details</h2>
        <p className="text-sm text-muted">Fix any prices or names the scanner got wrong, then save.</p>
        <Field label="Receipt name"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Total (${entry.currency})`}><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
          <Field label="Paid by"><Select value={payerId} onChange={(event) => setPayerId(event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field>
        </div>
        <div className="space-y-3">{items.map((item) => <div key={item.id} className="flex gap-2 items-center min-w-0">
          <div className="flex-1 min-w-0"><Input aria-label="Item name" value={item.name} onChange={(event) => setItems((current) => current.map((other) => other.id === item.id ? { ...other, name: event.target.value } : other))} placeholder="Item" /></div>
          <div className="w-24 shrink-0"><Input aria-label={`${item.name || "Item"} price`} inputMode="decimal" value={item.amount} onChange={(event) => setItems((current) => current.map((other) => other.id === item.id ? { ...other, amount: event.target.value } : other))} className="tnum" /></div>
          <button type="button" aria-label={`Remove ${item.name}`} className="text-negative px-1 shrink-0" onClick={() => setItems((current) => current.filter((other) => other.id !== item.id))}>×</button>
        </div>)}</div>
        <Button type="button" onClick={() => setItems((current) => [...current, { id: newId(), name: "", amount: "", memberIds: payerId ? [payerId] : [] }])}>Add item</Button>
        <p className="text-sm text-muted">Items: {formatAmount(subtotal, entry.currency)} · Tax, tip, and other difference: {formatAmount((parsedTotal ?? 0) - subtotal, entry.currency)}</p>
        {error ? <Banner tone="negative">{error}</Banner> : null}
        {notice ? <Banner>{notice}</Banner> : null}
        <div className="flex gap-2"><Button variant="primary" onClick={save}>Save details</Button><Button variant="danger" onClick={remove}>Delete receipt</Button></div>
      </Card>
    </div></Screen>
  </>;
}
