import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { receiptSplit } from "./receipt";
import type { Group, ReceiptItem } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudEnabled = Boolean(url && key);
let client: SupabaseClient | null = null;

export function cloud(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase is not configured.");
  client ??= createClient(url, key);
  return client;
}

export async function cloudUserId(): Promise<string> {
  const api = cloud();
  const { data: session, error: sessionError } = await api.auth.getSession();
  if (sessionError) throw sessionError;
  if (session.session?.user.id) return session.session.user.id;
  const { data, error } = await api.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Couldn't start your session.");
  return data.user.id;
}

interface GroupRow { id: string; data: Group; version: number; invite_code: string; owner_uid: string }
export interface ClaimRow { group_id: string; entry_id: string; item_id: string; user_uid: string; member_id: string; selected: boolean }
export interface CloudSnapshot {
  groups: Group[];
  invites: Record<string, string>;
  identities: Record<string, string>;
  owners: Record<string, boolean>;
}

export function applyClaims(group: Group, claims: ClaimRow[]): Group {
  const entries = group.entries.map((entry) => {
    if (entry.kind !== "expense" || !entry.receiptItems) return entry;
    const items: ReceiptItem[] = entry.receiptItems.map((item) => {
      const rows = claims.filter((claim) => claim.group_id === group.id && claim.entry_id === entry.id && claim.item_id === item.id);
      const members = new Set(item.memberIds);
      for (const row of rows) {
        if (row.selected) members.add(row.member_id);
        else members.delete(row.member_id);
      }
      return { ...item, memberIds: [...members] };
    });
    return { ...entry, receiptItems: items, split: receiptSplit(entry.amount, items, entry.payerId) };
  });
  return { ...group, entries };
}

export async function loadCloud(): Promise<CloudSnapshot> {
  const userId = await cloudUserId();
  const api = cloud();
  const [groupsResult, usersResult, claimsResult] = await Promise.all([
    api.from("cost_groups").select("id,data,version,invite_code,owner_uid").order("updated_at", { ascending: false }),
    api.from("cost_group_users").select("group_id,member_id"),
    api.from("cost_receipt_claims").select("group_id,entry_id,item_id,user_uid,member_id,selected"),
  ]);
  if (groupsResult.error) throw groupsResult.error;
  if (usersResult.error) throw usersResult.error;
  if (claimsResult.error) throw claimsResult.error;
  const rows = groupsResult.data as GroupRow[];
  const claims = claimsResult.data as ClaimRow[];
  return {
    groups: rows.map((row) => applyClaims(row.data, claims)),
    invites: Object.fromEntries(rows.map((row) => [row.id, row.invite_code])),
    identities: Object.fromEntries(usersResult.data.map((row) => [row.group_id, row.member_id])),
    owners: Object.fromEntries(rows.map((row) => [row.id, row.owner_uid === userId])),
  };
}

export async function createCloudGroup(group: Group): Promise<void> {
  const userId = await cloudUserId();
  const { error } = await cloud().from("cost_groups").insert({ id: group.id, owner_uid: userId, data: group });
  if (error) throw error;
}

/** Replay the original change against the latest row after a version conflict. */
export async function mutateCloudGroup(id: string, change: (group: Group) => Group): Promise<void> {
  await cloudUserId();
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: row, error: readError } = await cloud().from("cost_groups").select("data,version").eq("id", id).single();
    if (readError) throw readError;
    const next = change(row.data as Group);
    const { data: changed, error } = await cloud().from("cost_groups")
      .update({ data: next, version: row.version + 1, updated_at: new Date().toISOString() })
      .eq("id", id).eq("version", row.version).select("id");
    if (error) throw error;
    if (changed.length) return;
  }
  throw new Error("This group changed too quickly. Try again.");
}

export async function deleteCloudGroup(id: string): Promise<void> {
  const { error } = await cloud().from("cost_groups").delete().eq("id", id);
  if (error) throw error;
}

export async function setCloudClaim(groupId: string, entryId: string, itemId: string, memberId: string, selected: boolean): Promise<void> {
  const userId = await cloudUserId();
  const { error } = await cloud().from("cost_receipt_claims").upsert({
    group_id: groupId, entry_id: entryId, item_id: itemId,
    user_uid: userId, member_id: memberId, selected, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
