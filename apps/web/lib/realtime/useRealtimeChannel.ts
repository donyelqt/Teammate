import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardId, CardId, ListId } from "@teammate/shared";
import { isBoardId, isCardId, isListId } from "@teammate/shared";
import { createClient } from "../../src/lib/supabase/client";

// --- Types ---

export type RealtimeStatus =
  | "idle"
  | "subscribing"
  | "subscribed"
  | "error"
  | "closed";

export interface CardRow {
  id: CardId;
  board_id: BoardId;
  list_id: ListId;
  title: string;
  position: number;
}

export type RealtimeCardEvent =
  | { event: "INSERT"; card: CardRow }
  | { event: "UPDATE"; card: CardRow }
  | { event: "DELETE"; card: CardRow | null };

export interface UseRealtimeChannelOptions {
  onEvent?: (event: RealtimeCardEvent) => void;
  enabled?: boolean;
}

export interface UseRealtimeChannelResult {
  status: RealtimeStatus;
  error: string | null;
  lastEvent: RealtimeCardEvent | null;
  unsubscribe(): void;
}

// --- Pure helpers (exported for direct testing) ---

/**
 * Narrow an external postgres row into a CardRow using the branded-id guards.
 * Returns null unless every field is present and every id verifies.
 */
export function toCardRow(row: unknown): CardRow | null {
  if (!row || typeof row !== "object") return null;
  // Row is an object; field-level validity is checked by the guards below.
  const r = row as Record<string, unknown>;
  if (!isCardId(r["id"])) return null;
  if (!isBoardId(r["board_id"])) return null;
  if (!isListId(r["list_id"])) return null;
  if (typeof r["title"] !== "string") return null;
  if (typeof r["position"] !== "number") return null;
  return {
    id: r["id"],
    board_id: r["board_id"],
    list_id: r["list_id"],
    title: r["title"],
    position: r["position"],
  };
}

/**
 * Map a realtime postgres_changes payload onto the typed event union.
 * eventType 1 -> INSERT, 2 -> UPDATE, 3 -> DELETE. DELETE has no `new`,
 * so its card comes from `old` (which may itself be absent -> null).
 */
export function mapRealtimePayload(
  payload: unknown,
): RealtimeCardEvent | null {
  if (!payload || typeof payload !== "object") return null;
  // Payload is an object; eventType's number type is verified on the next line.
  const p = payload as Record<string, unknown>;
  if (typeof p["eventType"] !== "number") return null;

  const eventType = p["eventType"];
  const newRow = toCardRow(p["new"]);
  const oldRow = toCardRow(p["old"]);

  if (eventType === 1 && newRow) {
    return { event: "INSERT", card: newRow };
  }
  if (eventType === 2 && newRow) {
    return { event: "UPDATE", card: newRow };
  }
  if (eventType === 3) {
    return { event: "DELETE", card: oldRow };
  }
  return null;
}

/** Extract a human-readable message from whatever shape subscribe reported. */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const message: unknown = err.message;
    if (typeof message === "string") return message;
  }
  return "Subscription error";
}

/** Dependencies the subscription effect needs, decoupled from React state. */
export interface RealtimeSubscriptionDeps {
  boardId: BoardId;
  enabled: boolean;
  hasBoardId: boolean;
  client: SupabaseClient;
  onEvent?: (event: RealtimeCardEvent) => void;
  onStatus: (status: RealtimeStatus) => void;
  onError: (error: string | null) => void;
  onEventState: (event: RealtimeCardEvent | null) => void;
}

/**
 * The subscription lifecycle body. Returns the cleanup that unsubscribes
 * exactly once. No React state lives here, so it runs under plain tests.
 */
export function runRealtimeSubscription(
  deps: RealtimeSubscriptionDeps,
): () => void {
  if (!deps.enabled || !deps.hasBoardId) {
    deps.onStatus("idle");
    deps.onError(null);
    return () => {};
  }

  deps.onStatus("subscribing");
  deps.onError(null);

  const channel = deps.client.channel(`realtime:board:${deps.boardId}`);

  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "cards",
      filter: `board_id=eq.${deps.boardId}`,
    },
    (payload: unknown) => {
      const event = mapRealtimePayload(payload);
      if (event) {
        deps.onEventState(event);
        deps.onEvent?.(event);
      }
    },
  );

  const subscribeResult: unknown = channel.subscribe();

  if (subscribeResult instanceof Promise) {
    subscribeResult.then(
      () => deps.onStatus("subscribed"),
      (err: unknown) => {
        deps.onStatus("error");
        deps.onError(toErrorMessage(err));
      },
    );
  } else if (
    subscribeResult &&
    typeof subscribeResult === "object" &&
    "error" in subscribeResult
  ) {
    const errorResult = subscribeResult.error;
    if (errorResult) {
      deps.onStatus("error");
      deps.onError(toErrorMessage(errorResult));
    } else {
      deps.onStatus("subscribed");
    }
  } else {
    deps.onStatus("subscribed");
  }

  return () => {
    void channel.unsubscribe();
  };
}

// --- Hook ---

export function useRealtimeChannel(
  boardId: BoardId,
  options?: UseRealtimeChannelOptions,
  client?: SupabaseClient,
): UseRealtimeChannelResult {
  const enabled = options?.enabled ?? true;
  const onEvent = options?.onEvent;

  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<RealtimeCardEvent | null>(null);

  const channelRef = useRef<(() => void) | null>(null);
  const clientRef = useRef(client);
  clientRef.current = client;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const cleanup = runRealtimeSubscription({
      boardId,
      enabled,
      hasBoardId: isBoardId(boardId),
      client: clientRef.current ?? createClient(),
      onEvent: (event) => {
        onEventRef.current?.(event);
      },
      onStatus: setStatus,
      onError: setError,
      onEventState: setLastEvent,
    });
    channelRef.current = cleanup;
    return cleanup;
  }, [boardId, enabled]);

  return {
    status,
    error,
    lastEvent,
    unsubscribe: () => {
      channelRef.current?.();
    },
  };
}
