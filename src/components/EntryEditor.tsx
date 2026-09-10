"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar, Banner, Button, Card, Field, Input, Screen, Segmented, Select, Textarea, cx,
} from "./ui";
import { AppBar } from "./AppBar";
import { COMMON_CURRENCIES } from "@/lib/currencies";
import { newId } from "@/lib/id";
import { formatAmount, parseAmount } from "@/lib/money";
import { deletePhoto, fileToDataUrl, getPhoto, putPhoto } from "@/lib/photos";
import { computeShares } from "@/lib/split";
import { useStore } from "@/lib/store";
import {
  EXPENSE_CATEGORIES, type Entry, type ExpenseCategory, type Group, type SplitMode,
} from "@/lib/types";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  general: "General", food: "Food", drinks: "Drinks", groceries: "Groceries",
  lodging: "Lodging", transport: "Transport", fuel: "Fuel", tickets: "Tickets",
  shopping: "Shopping", fees: "Fees",
};

const todayIso = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export function EntryEditor({
  group,
  existing,
  initialKind = "expense",
}: {
  group: Group;
  existing?: Entry;
  initialKind?: "expense" | "transfer";
}) {
  const router = useRouter();
  const { addEntry, updateEntry, removeEntry } = useStore();

  const [kind, setKind] = useState<"expense" | "transfer">(existing?.kind ?? initialKind);
  const [amountText, setAmountText] = useState(
    existing ? formatAmount(existing.amount, existing.currency).replace(/,/g, "") : "",
  );
  const [currency, setCurrency] = useState(existing?.currency ?? group.baseCurrency);
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [note, setNote] = useState(existing?.note ?? "");

  const [title, setTitle] = useState(existing?.kind === "expense" ? existing.title : "");
  const [category, setCategory] = useState<ExpenseCategory>(
    existing?.kind === "expense" ? existing.category : "general",
  );
  const [payerId, setPayerId] = useState(
    existing?.kind === "expense" ? existing.payerId : (group.members[0]?.id ?? ""),
  );

  const [fromId, setFromId] = useState(
    existing?.kind === "transfer" ? existing.fromId : (group.members[0]?.id ?? ""),
  );
  const [toId, setToId] = useState(
    existing?.kind === "transfer" ? existing.toId : (group.members[1]?.id ?? group.members[0]?.id ?? ""),
  );

  const [splitMode, setSplitMode] = useState<SplitMode>(
    existing?.kind === "expense" ? existing.split.mode : "equal",
  );
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        existing?.kind === "expense"
          ? existing.split.entries.map((e) => e.memberId)
          : group.members.map((m) => m.id),
      ),
  );
  /** Raw per-member text for shares / exact / percent, keyed by member id. */
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (existing?.kind !== "expense" || existing.split.mode === "equal") return {};
    const out: Record<string, string> = {};
    for (const entry of existing.split.entries) {
      out[entry.memberId] =
        existing.split.mode === "exact"
          ? formatAmount(entry.value, existing.currency).replace(/,/g, "")
          : existing.split.mode === "percent"
            ? String(entry.value / 100)
            : String(entry.value);
    }
    return out;
  });

  const [photoId, setPhotoId] = useState(existing?.photoId);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photoId) {
      setPhotoData(null);
      return;
    }
    let cancelled = false;
    void getPhoto(photoId).then((data) => {
      if (!cancelled) setPhotoData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  const amount = parseAmount(amountText, currency);
  const participants = group.members.filter((m) => selected.has(m.id));

  /** The split as the domain layer wants it, plus any validation message. */
  const split = useMemo(() => {
    const entries = participants.map((member) => {
      const raw = values[member.id] ?? "";
      if (splitMode === "equal") return { memberId: member.id, value: 0 };
      if (splitMode === "exact") return { memberId: member.id, value: parseAmount(raw, currency) ?? 0 };
      if (splitMode === "percent") {
        const parsed = Number(raw.replace(",", "."));
        return { memberId: member.id, value: Number.isFinite(parsed) ? Math.round(parsed * 100) : 0 };
      }
      const parsed = Number(raw.replace(",", "."));
      return { memberId: member.id, value: Number.isFinite(parsed) && parsed > 0 ? parsed : raw === "" ? 1 : 0 };
    });
    return { mode: splitMode, entries };
  }, [participants, values, splitMode, currency]);

  const preview = useMemo(
    () => (amount === null ? null : computeShares(amount, split)),
    [amount, split],
  );

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setFormError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const id = photoId ?? newId();
      await putPhoto(id, dataUrl);
      setPhotoId(id);
      setPhotoData(dataUrl);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Couldn't attach that photo.");
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeAttachedPhoto = () => {
    if (photoId) void deletePhoto(photoId);
    setPhotoId(undefined);
    setPhotoData(null);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (amount === null) return setFormError("Enter an amount.");
    if (amount <= 0) return setFormError("The amount has to be more than zero.");
    if (!date) return setFormError("Pick a date.");

    const now = Date.now();
    let entry: Entry;

    if (kind === "transfer") {
      if (!fromId || !toId) return setFormError("Pick who paid and who received it.");
      if (fromId === toId) return setFormError("A payback needs two different people.");
      entry = {
        kind: "transfer",
        id: existing?.id ?? newId(),
        amount, currency, date, fromId, toId,
        note: note.trim() || undefined,
        photoId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    } else {
      if (!payerId) return setFormError("Pick who paid.");
      if (participants.length === 0) return setFormError("Pick at least one person to split this between.");
      if (preview?.error) return setFormError(preview.error);
      entry = {
        kind: "expense",
        id: existing?.id ?? newId(),
        title: title.trim() || CATEGORY_LABELS[category],
        amount, currency, date, payerId,
        split,
        category,
        note: note.trim() || undefined,
        photoId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    }

    if (existing) updateEntry(group.id, entry);
    else addEntry(group.id, entry);
    router.push(`/g/${group.id}`);
  };

  const remove = () => {
    if (!existing) return;
    if (!window.confirm("Delete this entry? This can't be undone.")) return;
    removeEntry(group.id, existing.id);
    router.push(`/g/${group.id}`);
  };

  const heading = existing
    ? existing.kind === "transfer" ? "Edit payback" : "Edit expense"
    : kind === "transfer" ? "Record a payback" : "Add an expense";

  return (
    <>
      <AppBar title={heading} subtitle={group.name} back={{ href: `/g/${group.id}`, label: "Back to group" }} />

      <Screen>
        <form onSubmit={submit} className="mt-4 space-y-4">
          {!existing ? (
            <Segmented
              label="Entry type"
              value={kind}
              onChange={setKind}
              options={[
                { value: "expense", label: "Expense" },
                { value: "transfer", label: "Payback" },
              ]}
            />
          ) : null}

          <Card className="p-4 space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <Field label="Amount">
                  <Input
                    autoFocus
                    inputMode="decimal"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    placeholder="0.00"
                    className="text-lg tnum"
                  />
                </Field>
              </div>
              <div className="w-32">
                <Field label="Currency">
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {currencyOptions(currency, group).map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            {kind === "expense" ? (
              <>
                <Field label="What was it for?">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder={CATEGORY_LABELS[category]} maxLength={80} />
                </Field>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Field label="Category">
                      <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="flex-1">
                    <Field label="Date">
                      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </Field>
                  </div>
                </div>
              </>
            ) : (
              <Field label="Date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            )}
          </Card>

          {kind === "transfer" ? (
            <Card className="p-4 space-y-4">
              <Field label="Who paid">
                <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
                  {group.members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </Select>
              </Field>
              <Field label="Who received it" hint="This moves the balance between these two people. It isn't group spending.">
                <Select value={toId} onChange={(e) => setToId(e.target.value)}>
                  {group.members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </Select>
              </Field>
            </Card>
          ) : (
            <>
              <Card className="p-4">
                <Field label="Who paid">
                  <Select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
                    {group.members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                  </Select>
                </Field>
              </Card>

              <Card className="p-4">
                <p className="text-[13px] font-medium text-muted mb-2">Split between</p>
                <Segmented
                  label="Split method"
                  value={splitMode}
                  onChange={setSplitMode}
                  options={[
                    { value: "equal", label: "Equally" },
                    { value: "shares", label: "Shares" },
                    { value: "exact", label: "Amounts" },
                    { value: "percent", label: "%" },
                  ]}
                />

                <div className="mt-3 -mx-4 divide-y divide-border border-t border-border">
                  {group.members.map((member) => {
                    const isOn = selected.has(member.id);
                    const share = preview?.shares.get(member.id);
                    return (
                      <div key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selected);
                            if (next.has(member.id)) next.delete(member.id);
                            else next.add(member.id);
                            setSelected(next);
                          }}
                          aria-pressed={isOn}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left"
                        >
                          <span
                            aria-hidden="true"
                            className={cx(
                              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                              isOn ? "bg-accent border-accent text-accent-fg" : "border-border-strong",
                            )}
                          >
                            {isOn ? (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6.2l2.4 2.4 4.6-5" stroke="currentColor" strokeWidth="1.8"
                                  strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : null}
                          </span>
                          <Avatar name={member.name} colorIndex={member.colorIndex} size={28} dimmed={!isOn} />
                          <span className={cx("truncate text-[15px]", isOn ? "" : "text-faint")}>{member.name}</span>
                        </button>

                        {isOn && splitMode !== "equal" ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Input
                              inputMode="decimal"
                              value={values[member.id] ?? ""}
                              onChange={(e) => setValues({ ...values, [member.id]: e.target.value })}
                              placeholder={splitMode === "shares" ? "1" : "0"}
                              aria-label={`${member.name}'s ${splitMode === "shares" ? "shares" : splitMode === "percent" ? "percentage" : "amount"}`}
                              className="w-20 text-right tnum py-1.5 min-h-9"
                            />
                            {splitMode === "percent" ? <span className="text-sm text-muted">%</span> : null}
                          </div>
                        ) : null}

                        {isOn && splitMode === "equal" && share !== undefined ? (
                          <span className="text-sm text-muted tnum shrink-0">
                            {formatAmount(share, currency)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        selected.size === group.members.length
                          ? new Set()
                          : new Set(group.members.map((m) => m.id)),
                      )
                    }
                    className="text-sm text-accent font-medium hover:underline underline-offset-2"
                  >
                    {selected.size === group.members.length ? "Clear all" : "Select everyone"}
                  </button>
                  {preview && !preview.error && amount !== null && splitMode !== "equal" ? (
                    <span className="text-sm text-muted tnum">
                      splits to {formatAmount(amount, currency)} {currency}
                    </span>
                  ) : null}
                </div>

                {preview?.error && selected.size > 0 ? (
                  <div className="mt-3">
                    <Banner tone="warn">{preview.error}</Banner>
                  </div>
                ) : null}
              </Card>
            </>
          )}

          <Card className="p-4 space-y-4">
            <Field label="Note" hint="Optional.">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Anything worth remembering" maxLength={500} />
            </Field>

            <div>
              <p className="text-[13px] font-medium text-muted mb-1.5">Receipt</p>
              {photoData ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoData} alt="Attached receipt"
                    className="w-full max-h-80 object-contain rounded-xl border border-border bg-surface-2" />
                  <Button type="button" size="sm" variant="danger" onClick={removeAttachedPhoto}>
                    Remove photo
                  </Button>
                </div>
              ) : (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void pickPhoto(e.target.files?.[0])}
                  />
                  <Button type="button" size="sm" disabled={photoBusy}
                    onClick={() => fileInput.current?.click()}>
                    {photoBusy ? "Attaching…" : "Attach a photo"}
                  </Button>
                </>
              )}
            </div>
          </Card>

          {formError ? <Banner tone="negative">{formError}</Banner> : null}

          <div className="flex gap-2 safe-bottom">
            <Button type="submit" variant="primary" size="lg" className="flex-1">
              {existing ? "Save changes" : kind === "transfer" ? "Save payback" : "Save expense"}
            </Button>
            {existing ? (
              <Button type="button" size="lg" variant="danger" onClick={remove}>
                Delete
              </Button>
            ) : null}
          </div>
        </form>
      </Screen>
    </>
  );
}

/** Group currency and anything already used, then the rest of the common list. */
function currencyOptions(current: string, group: Group): string[] {
  const seen = new Set<string>([group.baseCurrency.toUpperCase(), current.toUpperCase()]);
  for (const entry of group.entries) seen.add(entry.currency.toUpperCase());
  for (const code of Object.keys(group.rates)) seen.add(code.toUpperCase());
  for (const c of COMMON_CURRENCIES) seen.add(c.code);
  return [...seen];
}
