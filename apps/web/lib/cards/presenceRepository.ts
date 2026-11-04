import type { SupabaseClient } from "@supabase/supabase-js";

export interface CardPresence {
  card_id: string;
  user_id: string;
  editor_session: string;
  last_seen: string;
}

export interface PresenceRepository {
  upsert(cardId: string, userId: string, editorSession: string): Promise<void>;
  delete(cardId: string, editorSession: string): Promise<void>;
  list(cardIds: string[]): Promise<CardPresence[]>;
}

export function createPresenceRepository(
  client: SupabaseClient,
): PresenceRepository {
  return {
    async upsert(
      cardId: string,
      userId: string,
      editorSession: string,
    ): Promise<void> {
      const { error } = await client
        .from("card_presence")
        .upsert(
          {
            card_id: cardId,
            user_id: userId,
            editor_session: editorSession,
            last_seen: new Date().toISOString(),
          },
          { onConflict: "card_id,user_id,editor_session" },
        );
      if (error) throw new Error(error.message);
    },

    async delete(cardId: string, editorSession: string): Promise<void> {
      const { error } = await client
        .from("card_presence")
        .delete()
        .eq("card_id", cardId)
        .eq("editor_session", editorSession);
      if (error) throw new Error(error.message);
    },

    async list(cardIds: string[]): Promise<CardPresence[]> {
      if (cardIds.length === 0) return [];
      const { data, error } = await client
        .from("card_presence")
        .select("card_id, user_id, editor_session, last_seen")
        .in("card_id", cardIds)
        .order("last_seen", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CardPresence[];
    },
  };
}