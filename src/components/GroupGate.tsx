"use client";

import type { ReactNode } from "react";
import { AppBar } from "./AppBar";
import { EmptyState, LinkButton, Screen } from "./ui";

/** Shared loading / not-found chrome for every screen inside a group. */
export function GroupGate({
  ready,
  missing,
  children,
}: {
  ready: boolean;
  missing: boolean;
  children: ReactNode;
}) {
  if (!ready) {
    return (
      <>
        <AppBar title="Loading…" back={{ href: "/", label: "Back to groups" }} />
        <Screen>
          <div className="mt-5 space-y-3" aria-hidden="true">
            <div className="h-28 rounded-2xl bg-surface-2 animate-pulse" />
            <div className="h-20 rounded-2xl bg-surface-2 animate-pulse" />
          </div>
        </Screen>
      </>
    );
  }

  if (missing) {
    return (
      <>
        <AppBar title="Group not found" back={{ href: "/", label: "Back to groups" }} />
        <Screen>
          <EmptyState
            title="Group not found"
            body="Sign in with the account that belongs to this group, or ask the owner to invite your username."
            action={
              <LinkButton href="/" variant="primary">
                Back to groups
              </LinkButton>
            }
          />
        </Screen>
      </>
    );
  }

  return <>{children}</>;
}
