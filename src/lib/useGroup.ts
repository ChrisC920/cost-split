"use client";

import { useParams } from "next/navigation";
import { useStore } from "./store";
import type { Group } from "./types";

/**
 * Resolve the group in the current route.
 *
 * `ready` matters: before storage has loaded, a missing group means "not loaded
 * yet", not "doesn't exist", and showing a 404 in that window would be wrong.
 */
export function useGroup(): {
  groupId: string;
  group: Group | undefined;
  ready: boolean;
  missing: boolean;
} {
  const params = useParams<{ id: string }>();
  const groupId = typeof params.id === "string" ? params.id : "";
  const { getGroup, ready } = useStore();
  const group = getGroup(groupId);
  return { groupId, group, ready, missing: ready && !group };
}
