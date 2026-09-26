"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banner, Button, Card, Screen } from "@/components/ui";
import { cloud, cloudUserId } from "@/lib/cloud";
import { useStore } from "@/lib/store";

interface Preview { id: string; name: string; members: { id: string; name: string }[]; claimed: string[] }

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { refresh } = useStore();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await cloudUserId();
        const { data, error } = await cloud().rpc("preview_cost_invite", { p_code: code });
        if (error) throw error;
        if (!data) throw new Error("This invite link is not valid.");
        if (!cancelled) setPreview(data as Preview);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Couldn't open this invite.");
      } finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const join = async (memberId: string) => {
    setBusy(true);
    setError(null);
    const { data, error } = await cloud().rpc("join_cost_group", { p_code: code, p_member_id: memberId });
    if (error) { setError(error.message); setBusy(false); return; }
    try {
      await refresh();
      router.replace(`/g/${data as string}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't open the group.");
      setBusy(false);
    }
  };

  return <Screen><Card className="mt-8 p-5 space-y-4">
    <h1 className="text-2xl font-semibold">Join {preview?.name ?? "a group"}</h1>
    {busy && !preview ? <p className="text-muted">Opening invite…</p> : null}
    {preview ? <>
      <p className="text-muted">Choose your name. Your receipt picks will be saved under this person.</p>
      <div className="space-y-2">{preview.members.map((member) => <Button key={member.id} size="lg"
        disabled={busy || preview.claimed.includes(member.id)} onClick={() => void join(member.id)}
        className="w-full text-left">{member.name}{preview.claimed.includes(member.id) ? " · already joined" : ""}</Button>)}</div>
    </> : null}
    {error ? <Banner tone="negative">{error}</Banner> : null}
  </Card></Screen>;
}
