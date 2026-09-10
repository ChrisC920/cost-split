import { formatAmount } from "./money";
import { computeShares } from "./split";
import type { Group } from "./types";

/** Trigger a client-side download of some text. */
export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return name.trim().replace(/[^\w\-. ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "group";
}

/**
 * The group as a portable file.
 *
 * Photos aren't included — they live in a separate browser store and would
 * bloat the file well past what's practical to move around.
 */
export function exportGroupJson(group: Group): string {
  const { ...rest } = group;
  return JSON.stringify({ format: "cost-split-group", version: 1, group: rest }, null, 2);
}

/** Accepts a whole export file or a bare group object. Returns null if unusable. */
export function parseGroupJson(text: string): Group | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const candidate =
      "group" in parsed ? (parsed as { group: unknown }).group : parsed;
    if (!candidate || typeof candidate !== "object") return null;

    const group = candidate as Partial<Group>;
    if (typeof group.name !== "string" || !Array.isArray(group.members)) return null;

    return {
      id: typeof group.id === "string" ? group.id : "",
      name: group.name,
      baseCurrency: (group.baseCurrency ?? "USD").toUpperCase(),
      members: group.members,
      entries: Array.isArray(group.entries) ? group.entries : [],
      rates: group.rates && typeof group.rates === "object" ? group.rates : {},
      ratesUpdatedAt: group.ratesUpdatedAt,
      createdAt: group.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

const csvCell = (value: string | number): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** One row per entry, with a column per member holding that member's share. */
export function exportGroupCsv(group: Group): string {
  const members = group.members;
  const header = [
    "Date", "Type", "Description", "Category", "Paid by", "Amount", "Currency",
    ...members.map((m) => `${m.name} share`),
    "Note",
  ];

  const rows = [...group.entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((entry) => {
      const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";

      if (entry.kind === "transfer") {
        return [
          entry.date, "Transfer",
          `${nameOf(entry.fromId)} → ${nameOf(entry.toId)}`,
          "", nameOf(entry.fromId),
          formatAmount(entry.amount, entry.currency).replace(/,/g, ""),
          entry.currency,
          ...members.map((m) =>
            m.id === entry.toId
              ? formatAmount(entry.amount, entry.currency).replace(/,/g, "")
              : "",
          ),
          entry.note ?? "",
        ];
      }

      const { shares } = computeShares(entry.amount, entry.split);
      return [
        entry.date, "Expense", entry.title, entry.category, nameOf(entry.payerId),
        formatAmount(entry.amount, entry.currency).replace(/,/g, ""),
        entry.currency,
        ...members.map((m) => {
          const share = shares.get(m.id);
          return share === undefined ? "" : formatAmount(share, entry.currency).replace(/,/g, "");
        }),
        entry.note ?? "",
      ];
    });

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
