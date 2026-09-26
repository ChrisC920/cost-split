import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").trim().split("\n").map((line) => line.split("=")));
const makeClient = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const owner = makeClient();
const guest = makeClient();
const groupId = `verify-${Date.now()}`;
const photoPath = `${groupId}/test.png`;
const expect = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

try {
  const ownerAuth = expect(await owner.auth.signInAnonymously(), "owner sign-in");
  const guestAuth = expect(await guest.auth.signInAnonymously(), "guest sign-in");
  const data = {
    id: groupId, name: "Cloud verification", baseCurrency: "USD", rates: {}, createdAt: Date.now(), updatedAt: Date.now(),
    members: [{ id: "a", name: "Ana", colorIndex: 0 }, { id: "b", name: "Ben", colorIndex: 1 }],
    entries: [{ kind: "expense", id: "receipt", title: "Dinner", amount: 1100, currency: "USD", date: "2026-09-26",
      payerId: "a", category: "food", split: { mode: "exact", entries: [{ memberId: "a", value: 1100 }] },
      receiptItems: [{ id: "coffee", name: "Coffee", amount: 1000, memberIds: ["a"] }], createdAt: Date.now(), updatedAt: Date.now() }],
  };
  expect(await owner.from("cost_groups").insert({ id: groupId, owner_uid: ownerAuth.user.id, data }), "create group");
  const hidden = expect(await guest.from("cost_groups").select("id").eq("id", groupId), "check group privacy");
  if (hidden.length !== 0) throw new Error("An uninvited user could read the group");
  const row = expect(await owner.from("cost_groups").select("invite_code").eq("id", groupId).single(), "read invite");
  const preview = expect(await guest.rpc("preview_cost_invite", { p_code: row.invite_code }), "preview invite");
  if (preview.name !== data.name) throw new Error("Invite preview was wrong");
  const joined = expect(await guest.rpc("join_cost_group", { p_code: row.invite_code, p_member_id: "b" }), "join group");
  if (joined !== groupId) throw new Error("Join returned the wrong group");
  const visible = expect(await guest.from("cost_groups").select("id").eq("id", groupId).single(), "guest read group");
  if (visible.id !== groupId) throw new Error("Guest could not read the group");
  expect(await guest.from("cost_groups").update({ data: { ...data, name: "Cloud verification updated" }, version: 2 })
    .eq("id", groupId).eq("version", 1), "guest update group");
  const updated = expect(await owner.from("cost_groups").select("data").eq("id", groupId).single(), "owner read update");
  if (updated.data.name !== "Cloud verification updated") throw new Error("Group edit did not sync");
  expect(await guest.from("cost_receipt_claims").upsert({ group_id: groupId, entry_id: "receipt", item_id: "coffee", user_uid: guestAuth.user.id, member_id: "b", selected: true }), "guest claim");
  const spoof = await guest.from("cost_receipt_claims").upsert({ group_id: groupId, entry_id: "receipt", item_id: "other", user_uid: guestAuth.user.id, member_id: "a", selected: true });
  if (!spoof.error) throw new Error("Guest could claim another person's items");
  expect(await owner.from("cost_receipt_claims").upsert({ group_id: groupId, entry_id: "receipt", item_id: "coffee", user_uid: ownerAuth.user.id, member_id: "a", selected: false }), "owner opt-out");
  const claims = expect(await guest.from("cost_receipt_claims").select("member_id,selected").eq("group_id", groupId), "read claims");
  if (claims.length !== 2 || !claims.some((claim) => claim.member_id === "b" && claim.selected)) throw new Error("Claims did not sync");
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y6k54sAAAAASUVORK5CYII=", "base64");
  expect(await owner.storage.from("cost-receipts").upload(photoPath, image, { contentType: "image/png" }), "upload photo");
  const downloaded = expect(await guest.storage.from("cost-receipts").download(photoPath), "guest download photo");
  if (downloaded.size !== image.length) throw new Error("Photo size changed");
  console.log("Verified invite privacy, shared edits, two identities, independent claims, and shared photo.");
} finally {
  await owner.storage.from("cost-receipts").remove([photoPath]);
  await owner.from("cost_groups").delete().eq("id", groupId);
}
