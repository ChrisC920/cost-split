"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBar } from "@/components/AppBar";
import { GroupGate } from "@/components/GroupGate";
import { Banner, Button, Card, Screen } from "@/components/ui";
import { cloud, cloudUserId } from "@/lib/cloud";
import { newId } from "@/lib/id";
import { fileToDataUrl, putPhoto } from "@/lib/photos";
import { receiptSplit, type ParsedReceipt } from "@/lib/receipt";
import { useGroup } from "@/lib/useGroup";
import { useStore } from "@/lib/store";
import type { ReceiptItem } from "@/lib/types";

export default function NewReceiptPage() {
  const { group, ready, missing } = useGroup();
  const { addEntry, waitForSync } = useStore();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file?: File) => {
    if (!file || !group || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await fileToDataUrl(file);
      const photoId = `${group.id}/${newId()}.jpg`;
      await waitForSync(group.id);
      await putPhoto(photoId, photo);
      let parsed: ParsedReceipt = { title: "Receipt", items: [], total: null };
      let scanError = "";
      try {
        await cloudUserId();
        const { data: { session } } = await cloud().auth.getSession();
        if (!session) throw new Error("Your session expired. Reload and try again.");
        const response = await fetch("/api/receipt/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ groupId: group.id, currency: group.baseCurrency, image: photo }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not scan this receipt.");
        parsed = result as ParsedReceipt;
      } catch (cause) {
        scanError = cause instanceof Error ? cause.message : "Could not scan this receipt.";
      }
      const payerId = group.members[0]?.id ?? "";
      const items: ReceiptItem[] = parsed.items.map((item) => ({
        id: newId(), ...item, memberIds: payerId ? [payerId] : [],
      }));
      const amount = parsed.total ?? items.reduce((sum, item) => sum + item.amount, 0);
      const now = Date.now();
      const id = newId();
      addEntry(group.id, {
        kind: "expense", id, title: parsed.title, amount, currency: group.baseCurrency,
        date: new Date(now - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10),
        payerId, split: receiptSplit(amount, items), category: "food", photoId,
        receiptItems: items, createdAt: now, updatedAt: now,
      });
      router.push(`/g/${group.id}/receipt/${id}${scanError ? `?scanError=${encodeURIComponent(scanError)}` : ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the receipt.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return <GroupGate ready={ready} missing={missing}>{group ? <>
    <AppBar title="Add a receipt" subtitle={group.name} back={{ href: `/g/${group.id}`, label: "Back to group" }} />
    <Screen><Card className="mt-5 p-5 space-y-4">
      <h2 className="text-xl font-semibold">Take or choose a receipt photo</h2>
      <p className="text-sm text-muted">We will read the items, save the photo, and add the receipt to this group. Check the result before anyone picks items.</p>
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(event) => void upload(event.target.files?.[0])} />
      <Button variant="primary" size="lg" disabled={busy || group.members.length === 0} onClick={() => input.current?.click()}>
        {busy ? "Reading receipt…" : "Take or choose photo"}
      </Button>
      {group.members.length === 0 ? <Banner>Add a person to the group first.</Banner> : null}
      {error ? <Banner tone="negative">{error}</Banner> : null}
    </Card></Screen>
  </> : null}</GroupGate>;
}
