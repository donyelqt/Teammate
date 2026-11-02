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

export interface QueuedMutation {
  readonly cardId: CardId;
  readonly queuedAt: string;
}
