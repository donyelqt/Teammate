import type { SyncState } from "./sync-state.js";

// @ts-expect-error synced has no queued field
const syncedWithCount: SyncState = { kind: "synced", queued: 1 };

// @ts-expect-error pending requires queued
const pendingWithoutCount: SyncState = { kind: "pending" };

// @ts-expect-error offline requires since
const offlineWithoutSince: SyncState = { kind: "offline", queued: 1 };

// @ts-expect-error not a member of SyncState
const unknownKind: SyncState = { kind: "disconnected" };

function exhaustive(state: SyncState): string {
  switch (state.kind) {
    case "synced":
      return "synced";
    case "pending":
      return "pending";
    case "offline":
      return "offline";
    case "conflict":
      return "conflict";
    default: {
      const never: never = state;
      return never;
    }
  }
}

export const assertions = [
  syncedWithCount,
  pendingWithoutCount,
  offlineWithoutSince,
  unknownKind,
  exhaustive,
];
