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
  list_id: ListId;
  title: string;
  position: number;
}

export type RealtimeCardEvent =
  | { event: "INSERT"; card: CardRow }
  | { event: "UPDATE"; card: CardRow }
  | { event: "DELETE"; cardId: CardId | null };

export interface UseRealtimeChannelOptions {
  onEvent?: (event: RealtimeCardEvent) => void;
  enabled?: boolean;
  /**
   * Lists whose cards this channel should receive. When provided, the
   * subscription carries a server-side `list_id=in.(...)` filter.
   */
  listIds?: readonly ListId[] | undefined;
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
  if (!isListId(r["list_id"])) return null;
  if (typeof r["title"] !== "string") return null;
  if (typeof r["position"] !== "number") return null;
  return {
    id: r["id"],
    list_id: r["list_id"],
    title: r["title"],
    position: r["position"],
  };
}

/**
 * Supabase sends `eventType` as a string ("INSERT", "UPDATE", "DELETE").
 * Some transports deliver the legacy numeric codes (1, 2, 3). Accept both.
 */
export type RealtimeEventKind = "INSERT" | "UPDATE" | "DELETE";

const EVENT_KIND_BY_CODE: Record<number, RealtimeEventKind> = {
  1: "INSERT",
  2: "UPDATE",
  3: "DELETE",
};

/**
 * Read the event kind from a postgres_changes payload.
 * Returns null when the payload carries no recognizable event type.
 */
export function toEventKind(payload: unknown): RealtimeEventKind | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>)["eventType"];

  if (typeof raw === "string") {
    const upper = raw.toUpperCase();
    if (upper === "INSERT" || upper === "UPDATE" || upper === "DELETE") {
      return upper;
    }
    return null;
  }

  if (typeof raw === "number") {
    return EVENT_KIND_BY_CODE[raw] ?? null;
  }

  return null;
}

/**
 * Map a realtime postgres_changes payload onto the typed event union.
 *
 * DELETE carries only the primary key in `old` when the table's replica
 * identity is not FULL, so deletes resolve to a bare card id.
 */
export function mapRealtimePayload(
  payload: unknown,
): RealtimeCardEvent | null {
  const kind = toEventKind(payload);
  if (!kind) return null;

  const p = payload as Record<string, unknown>;

  if (kind === "DELETE") {
    const oldRow = p["old"];
    if (!oldRow || typeof oldRow !== "object") {
      return { event: "DELETE", cardId: null };
    }
    const id = (oldRow as Record<string, unknown>)["id"];
    if (!isCardId(id)) {
      return { event: "DELETE", cardId: null };
    }
    return { event: "DELETE", cardId: id };
  }

  const newRow = toCardRow(p["new"]);

  if (kind === "INSERT" && newRow) {
    return { event: "INSERT", card: newRow };
  }
  if (kind === "UPDATE" && newRow) {
    return { event: "UPDATE", card: newRow };
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
  listIds?: readonly ListId[] | undefined;
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

  const listIds = deps.listIds ?? [];
  const filter =
    listIds.length > 0 ? `list_id=in.(${listIds.join(",")})` : undefined;

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "cards",
      ...(filter ? { filter } : {}),
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
  const listIds = options?.listIds;

  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<RealtimeCardEvent | null>(null);

  const channelRef = useRef<(() => void) | null>(null);
  const clientRef = useRef(client);
  clientRef.current = client;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const listIdsKey = listIds ? listIds.join(",") : "";
  const listIdsRef = useRef(listIds);
  listIdsRef.current = listIds;

  useEffect(() => {
    const cleanup = runRealtimeSubscription({
      boardId,
      enabled,
      hasBoardId: isBoardId(boardId),
      listIds: listIdsRef.current,
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
  }, [boardId, enabled, listIdsKey]);

  return {
    status,
    error,
    lastEvent,
    unsubscribe: () => {
      channelRef.current?.();
    },
  };
}
