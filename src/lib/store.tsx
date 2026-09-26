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
import {
  cloud, cloudEnabled, createCloudGroup, deleteCloudGroup, loadCloud,
  mutateCloudGroup, setCloudClaim,
} from "./cloud";
import { deletePhoto, getPhoto, putPhoto } from "./photos";
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
  getInvite(groupId: string): string | undefined;
  getIdentity(groupId: string): string | undefined;
  isOwner(groupId: string): boolean;
  refresh(): Promise<void>;
  waitForSync(groupId: string): Promise<void>;
  setReceiptClaim(groupId: string, entryId: string, itemId: string, selected: boolean): Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

const messageOf = (cause: unknown, fallback: string) =>
  cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
    ? cause.message : fallback;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Record<string, string>>({});
  const [identities, setIdentities] = useState<Record<string, string>>({});
  const [owners, setOwners] = useState<Record<string, boolean>>({});
  const storage = useMemo(() => createStorage(), []);
  const pending = useRef(new Map<string, Promise<void>>());

  const refresh = useCallback(async () => {
    if (!cloudEnabled) return;
    const snapshot = await loadCloud();
    setData({ version: 1, groups: snapshot.groups });
    setInvites(snapshot.invites);
    setIdentities(snapshot.identities);
    setOwners(snapshot.owners);
  }, []);

  const enqueue = useCallback((id: string, job: () => Promise<void>) => {
    if (!cloudEnabled) return;
    const previous = pending.current.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(job).then(refresh).catch((cause: unknown) => {
      setError(messageOf(cause, "Couldn't sync your changes."));
    });
    pending.current.set(id, next);
  }, [refresh]);

  // Skip persisting the initial empty state, which would clobber real data
  // before the first load resolves.
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    storage.load().then(async (loadedData) => {
        if (cancelled) return;
        setData(loadedData);
        if (cloudEnabled) {
          try {
            for (const group of loadedData.groups) {
              try { await createCloudGroup(group); }
              catch (cause) {
                // A group already uploaded by this browser is expected.
                if (!(cause && typeof cause === "object" && "code" in cause && cause.code === "23505")) throw cause;
              }
              for (const entry of group.entries) {
                if (!entry.photoId || entry.photoId.includes("/")) continue;
                const image = await getPhoto(entry.photoId);
                if (!image) continue;
                const oldId = entry.photoId;
                const newPhotoId = `${group.id}/${entry.id}.jpg`;
                await putPhoto(newPhotoId, image);
                await mutateCloudGroup(group.id, (remote) => ({ ...remote, entries: remote.entries.map((item) =>
                  item.id === entry.id && item.photoId === oldId ? { ...item, photoId: newPhotoId } : item,
                ) }));
              }
            }
            if (!cancelled) await refresh();
          } catch (cause) {
            if (!cancelled) setError(messageOf(cause, "Couldn't connect to Supabase."));
          }
        }
      })
      .finally(() => {
        if (cancelled) return;
        loaded.current = true;
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storage, refresh]);

  useEffect(() => {
    if (!cloudEnabled) return;
    const channel = cloud().channel("cost-split")
      .on("postgres_changes", { event: "*", schema: "public", table: "cost_groups" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "cost_receipt_claims" }, () => void refresh())
      .subscribe();
    return () => { void cloud().removeChannel(channel); };
  }, [refresh]);

  useEffect(() => {
    if (!loaded.current) return;
    storage.save(data).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Couldn't save your changes.");
    });
  }, [data, storage]);

  // Keep two tabs of the same app in step.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (cloudEnabled) return;
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
    enqueue(groupId, () => mutateCloudGroup(groupId, fn));
  }, [enqueue]);

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
        enqueue(group.id, () => createCloudGroup(group));
        return group;
      },

      updateGroup(id, patch) {
        mutateGroup(id, (group) => ({ ...group, ...patch }));
      },

      deleteGroup(id) {
        const group = getGroup(id);
        setData((current) => ({
          ...current,
          groups: current.groups.filter((g) => g.id !== id),
        }));
        if (!cloudEnabled) {
          for (const entry of group?.entries ?? []) if (entry.photoId) void deletePhoto(entry.photoId);
        }
        enqueue(id, async () => {
          for (const entry of group?.entries ?? []) {
            if (entry.photoId) await deletePhoto(entry.photoId);
          }
          await deleteCloudGroup(id);
        });
      },

      importGroup(group) {
        // Re-key so an import can never overwrite a group already on this device.
        const fresh: Group = { ...group, id: newId(), updatedAt: Date.now() };
        setData((current) => ({ ...current, groups: [fresh, ...current.groups] }));
        enqueue(fresh.id, () => createCloudGroup(fresh));
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
      getInvite: (groupId) => invites[groupId],
      getIdentity: (groupId) => identities[groupId],
      isOwner: (groupId) => owners[groupId] ?? false,
      refresh,
      waitForSync: (groupId) => pending.current.get(groupId) ?? Promise.resolve(),
      async setReceiptClaim(groupId, entryId, itemId, selected) {
        const memberId = identities[groupId];
        if (!memberId) throw new Error("Join this group as a person first.");
        await setCloudClaim(groupId, entryId, itemId, memberId, selected);
        await refresh();
      },
    };
  }, [data, ready, error, mutateGroup, enqueue, invites, identities, owners, refresh]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside a StoreProvider.");
  return store;
}
