/**
 * Sync state as a discriminated union (ADR-0006, ADR-0007).
 *
 * Four states, each carrying only the data that state needs. Modelling them as
 * one object with optional fields would let an impossible combination be
 * constructed, such as a synced state with a queued count.
 */

import type { CardId } from "./ids.js";

export type SyncState =
  | { readonly kind: "synced" }
  | { readonly kind: "pending"; readonly queued: number }
  | {
      readonly kind: "offline";
      readonly queued: number;
      readonly since: string;
    }
  | {
      readonly kind: "conflict";
      readonly local: unknown;
      readonly remote: unknown;
    };

/**
 * Exhaustiveness assertion. Adding a variant and forgetting a case here is a
 * compile error rather than a silent fallthrough.
 */
export function syncBadge(state: SyncState): string | null {
  switch (state.kind) {
    case "synced":
      return null;
    case "pending":
      return `Saving ${state.queued}`;
    case "offline":
      return `Offline, ${state.queued} queued`;
    case "conflict":
      return "Conflict";
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

/** Ordered oldest-first: the drain order for the reconnect queue. */
export interface QueuedMutation {
  readonly cardId: CardId;
  readonly queuedAt: string;
}
