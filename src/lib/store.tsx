"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { newId } from "./id";
import { deletePhoto } from "./photos";
import { createStorage, emptyData, STORAGE_KEY, migrate } from "./storage";
import type { AppData, Entry, Group, Member } from "./types";

interface StoreValue {
  data: AppData;
  /** False until the first read from storage finishes, so we don't flash an empty state. */
  ready: boolean;
  /** Set when a write failed — most likely a full storage quota. */
  error: string | null;
  dismissError(): void;

  getGroup(id: string): Group | undefined;
  createGroup(input: { name: string; baseCurrency: string; memberNames: string[] }): Group;
  updateGroup(id: string, patch: Partial<Omit<Group, "id">>): void;
  deleteGroup(id: string): void;
  importGroup(group: Group): Group;

  addMember(groupId: string, name: string): Member | undefined;
  updateMember(groupId: string, memberId: string, patch: Partial<Omit<Member, "id">>): void;
  removeMember(groupId: string, memberId: string): void;

  addEntry(groupId: string, entry: Entry): void;
  updateEntry(groupId: string, entry: Entry): void;
  removeEntry(groupId: string, entryId: string): void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storage = useMemo(() => createStorage(), []);

  // Skip persisting the initial empty state, which would clobber real data
  // before the first load resolves.
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    storage
      .load()
      .then((loadedData) => {
        if (cancelled) return;
        setData(loadedData);
      })
      .finally(() => {
        if (cancelled) return;
        loaded.current = true;
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  useEffect(() => {
    if (!loaded.current) return;
    storage.save(data).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Couldn't save your changes.");
    });
  }, [data, storage]);

  // Keep two tabs of the same app in step.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || event.newValue === null) return;
      try {
        setData(migrate(JSON.parse(event.newValue)));
      } catch {
        // Ignore an unparseable write from the other tab.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const mutateGroup = useCallback((groupId: string, fn: (group: Group) => Group) => {
    setData((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId ? { ...fn(group), updatedAt: Date.now() } : group,
      ),
    }));
  }, []);

  const value = useMemo<StoreValue>(() => {
    const getGroup = (id: string) => data.groups.find((g) => g.id === id);

    return {
      data,
      ready,
      error,
      dismissError: () => setError(null),
      getGroup,

      createGroup({ name, baseCurrency, memberNames }) {
        const now = Date.now();
        const group: Group = {
          id: newId(),
          name: name.trim() || "New group",
          baseCurrency: baseCurrency.toUpperCase(),
          members: memberNames
            .map((n) => n.trim())
            .filter(Boolean)
            .map((n, i) => ({ id: newId(), name: n, colorIndex: i })),
          entries: [],
          rates: {},
          createdAt: now,
          updatedAt: now,
        };
        setData((current) => ({ ...current, groups: [group, ...current.groups] }));
        return group;
      },

      updateGroup(id, patch) {
        mutateGroup(id, (group) => ({ ...group, ...patch }));
      },

      deleteGroup(id) {
        const group = getGroup(id);
        // Reclaim the IndexedDB space the group's receipts were using.
        for (const entry of group?.entries ?? []) {
          if (entry.photoId) void deletePhoto(entry.photoId);
        }
        setData((current) => ({
          ...current,
          groups: current.groups.filter((g) => g.id !== id),
        }));
      },

      importGroup(group) {
        // Re-key so an import can never overwrite a group already on this device.
        const fresh: Group = { ...group, id: newId(), updatedAt: Date.now() };
        setData((current) => ({ ...current, groups: [fresh, ...current.groups] }));
        return fresh;
      },

      addMember(groupId, name) {
        const trimmed = name.trim();
        if (!trimmed) return undefined;
        const group = getGroup(groupId);
        const member: Member = {
          id: newId(),
          name: trimmed,
          colorIndex: group?.members.length ?? 0,
        };
        mutateGroup(groupId, (g) => ({ ...g, members: [...g.members, member] }));
        return member;
      },

      updateMember(groupId, memberId, patch) {
        mutateGroup(groupId, (group) => ({
          ...group,
          members: group.members.map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
        }));
      },

      removeMember(groupId, memberId) {
        mutateGroup(groupId, (group) => ({
          ...group,
          members: group.members.filter((m) => m.id !== memberId),
        }));
      },

      addEntry(groupId, entry) {
        mutateGroup(groupId, (group) => ({ ...group, entries: [entry, ...group.entries] }));
      },

      updateEntry(groupId, entry) {
        mutateGroup(groupId, (group) => ({
          ...group,
          entries: group.entries.map((e) =>
            e.id === entry.id ? { ...entry, updatedAt: Date.now() } : e,
          ),
        }));
      },

      removeEntry(groupId, entryId) {
        const entry = getGroup(groupId)?.entries.find((e) => e.id === entryId);
        if (entry?.photoId) void deletePhoto(entry.photoId);
        mutateGroup(groupId, (group) => ({
          ...group,
          entries: group.entries.filter((e) => e.id !== entryId),
        }));
      },
    };
  }, [data, ready, error, mutateGroup]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside a StoreProvider.");
  return store;
}
