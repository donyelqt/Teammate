/**
 * Compile-time assertions for the SyncState union.
 *
 * These cannot run as Vitest cases. A `@ts-expect-error` line passes a type
 * check when the compiler rejects the code and fails the type check when it
 * stops rejecting it, which is the assertion. Vitest only sees the runtime
 * value, so it cannot verify any of it.
 *
 * The typecheck script covers this file because tsconfig includes all .ts files.
 */

import type { SyncState } from "./sync-state.js";

// A synced state carries no queued count.
// @ts-expect-error synced has no queued field
const syncedWithCount: SyncState = { kind: "synced", queued: 1 };

// A pending state requires its count.
// @ts-expect-error pending requires queued
const pendingWithoutCount: SyncState = { kind: "pending" };

// An offline state requires the outage timestamp.
// @ts-expect-error offline requires since
const offlineWithoutSince: SyncState = { kind: "offline", queued: 1 };

// A kind outside the union.
// @ts-expect-error not a member of SyncState
const unknownKind: SyncState = { kind: "disconnected" };

// The exhaustive switch fails to compile when a variant is added and not handled.
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
