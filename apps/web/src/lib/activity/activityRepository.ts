import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActivityEvent {
  id: number;
  workspace_id: string;
  board_id: string | null;
  card_id: string | null;
  actor_id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ActivityRepository {
  list(boardId: string, limit?: number): Promise<ActivityEvent[]>;
}

function toActivityEvent(row: unknown): ActivityEvent | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "number") return null;
  if (typeof r.actor_id !== "string") return null;
  if (typeof r.kind !== "string") return null;
  if (typeof r.created_at !== "string") return null;
  const payload = r.payload;
  const safePayload: Record<string, unknown> =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  return {
    id: r.id,
    workspace_id: typeof r.workspace_id === "string" ? r.workspace_id : "",
    board_id: typeof r.board_id === "string" ? r.board_id : null,
    card_id: typeof r.card_id === "string" ? r.card_id : null,
    actor_id: r.actor_id,
    kind: r.kind,
    payload: safePayload,
    created_at: r.created_at,
  };
}

export function createActivityRepository(
  client: SupabaseClient,
): ActivityRepository {
  return {
    async list(boardId: string, limit = 50) {
      const { data, error } = await client
        .from("activity_events")
        .select(
          "id, workspace_id, board_id, card_id, actor_id, kind, payload, created_at",
        )
        .eq("board_id", boardId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      const events: ActivityEvent[] = [];
      for (const row of data ?? []) {
        const event = toActivityEvent(row);
        if (event) events.push(event);
      }
      return events;
    },
  };
}