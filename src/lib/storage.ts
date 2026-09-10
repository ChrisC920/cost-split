import type { AppData, Group } from "./types";

/**
 * Where groups live.
 *
 * Everything the app does goes through this interface. Today it's backed by
 * localStorage, which is what makes the app work offline and without an
 * account — the same two properties the iPhone app is built around. Swapping in
 * a server-backed implementation later means implementing this interface and
 * changing the one line in `createStorage`; nothing in the UI reads storage
 * directly.
 */
export interface Storage {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
}

export const STORAGE_KEY = "cost-split:data:v1";
export const CURRENT_VERSION = 1;

export const emptyData = (): AppData => ({ version: CURRENT_VERSION, groups: [] });

class LocalStorage implements Storage {
  async load(): Promise<AppData> {
    if (typeof window === "undefined") return emptyData();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyData();
      return migrate(JSON.parse(raw));
    } catch {
      // Corrupt or unreadable (private mode, cleared storage). Start clean
      // rather than trapping the user on an error screen.
      return emptyData();
    }
  }

  async save(data: AppData): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === "QuotaExceededError"
          ? "Out of browser storage. Export and remove an old group to free space."
          : "Couldn't save to this browser's storage.",
      );
    }
  }
}

export function createStorage(): Storage {
  return new LocalStorage();
}

/** Coerce whatever was on disk into the current shape, dropping anything unusable. */
export function migrate(raw: unknown): AppData {
  if (!raw || typeof raw !== "object") return emptyData();
  const data = raw as Partial<AppData>;
  if (!Array.isArray(data.groups)) return emptyData();

  const groups = data.groups.filter(isUsableGroup).map(normalizeGroup);
  return { version: CURRENT_VERSION, groups };
}

function isUsableGroup(group: unknown): group is Group {
  if (!group || typeof group !== "object") return false;
  const g = group as Partial<Group>;
  return typeof g.id === "string" && typeof g.name === "string" && Array.isArray(g.members);
}

function normalizeGroup(group: Group): Group {
  return {
    ...group,
    baseCurrency: (group.baseCurrency ?? "USD").toUpperCase(),
    members: Array.isArray(group.members) ? group.members : [],
    entries: Array.isArray(group.entries) ? group.entries : [],
    rates: group.rates && typeof group.rates === "object" ? group.rates : {},
    createdAt: group.createdAt ?? Date.now(),
    updatedAt: group.updatedAt ?? Date.now(),
  };
}
