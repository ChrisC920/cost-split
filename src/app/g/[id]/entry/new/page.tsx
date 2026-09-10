"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { EntryEditor } from "@/components/EntryEditor";
import { GroupGate } from "@/components/GroupGate";
import { useGroup } from "@/lib/useGroup";

export default function NewEntryPage() {
  return (
    <Suspense fallback={null}>
      <NewEntry />
    </Suspense>
  );
}

function NewEntry() {
  const { group, ready, missing } = useGroup();
  const search = useSearchParams();
  const kind = search.get("kind") === "transfer" ? "transfer" : "expense";

  return (
    <GroupGate ready={ready} missing={missing}>
      {group ? <EntryEditor group={group} initialKind={kind} /> : null}
    </GroupGate>
  );
}
