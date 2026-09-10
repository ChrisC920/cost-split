"use client";

import { useParams } from "next/navigation";
import { AppBar } from "@/components/AppBar";
import { EntryEditor } from "@/components/EntryEditor";
import { GroupGate } from "@/components/GroupGate";
import { EmptyState, LinkButton, Screen } from "@/components/ui";
import { useGroup } from "@/lib/useGroup";

export default function EditEntryPage() {
  const { group, ready, missing } = useGroup();
  const params = useParams<{ entryId: string }>();
  const entryId = typeof params.entryId === "string" ? params.entryId : "";
  const entry = group?.entries.find((e) => e.id === entryId);

  return (
    <GroupGate ready={ready} missing={missing}>
      {group && entry ? (
        <EntryEditor group={group} existing={entry} />
      ) : group ? (
        <>
          <AppBar title="Entry not found" back={{ href: `/g/${group.id}`, label: "Back to group" }} />
          <Screen>
            <EmptyState
              title="This entry is gone"
              body="It may have been deleted from another tab."
              action={
                <LinkButton href={`/g/${group.id}`} variant="primary">
                  Back to {group.name}
                </LinkButton>
              }
            />
          </Screen>
        </>
      ) : null}
    </GroupGate>
  );
}
