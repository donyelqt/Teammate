import { ulid, ulidToUUID } from "ulid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardId, ListId, UserId } from "@teammate/shared";
import { isCardId, isListId } from "@teammate/shared";
import type { Card } from "./cardReducer";

const CardRowSchema = {
  parse(row: unknown): Card {
    if (!row || typeof row !== "object") throw new Error("invalid card row");
    const r = row as Record<string, unknown>;
    if (!isCardId(r["id"])) throw new Error("invalid card id");
    if (!isListId(r["list_id"])) throw new Error("invalid list id");
    if (typeof r["title"] !== "string") throw new Error("invalid title");
    if (typeof r["position"] !== "number") throw new Error("invalid position");
    return {
      id: r["id"],
      list_id: r["list_id"],
      title: r["title"],
      position: r["position"],
    };
  },
};

export function toCard(row: unknown): Card | null {
  try {
    return CardRowSchema.parse(row);
  } catch {
    return null;
  }
}

export interface CardRepository {
  list(listIds: readonly ListId[]): Promise<Card[]>;
  create(input: {
    listId: ListId;
    title: string;
    userId: UserId;
  }): Promise<Card>;
  update(cardId: CardId, title: string): Promise<Card>;
  delete(cardId: CardId): Promise<void>;
}

export function createCardRepository(
  client: SupabaseClient,
): CardRepository {
  return {
    async list(listIds: readonly ListId[]): Promise<Card[]> {
      if (listIds.length === 0) return [];
      const { data, error } = await client
        .from("cards")
        .select("id, list_id, title, position")
        .in("list_id", listIds)
        .is("archived_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => toCard(r)!).filter(Boolean);
    },
    async create(input: {
      listId: ListId;
      title: string;
      userId: UserId;
    }): Promise<Card> {
      const id = ulidToUUID(ulid()) as CardId;
      const position = 0;
      const { data, error } = await client
        .from("cards")
        .insert({
          id,
          list_id: input.listId,
          title: input.title,
          position,
          created_by: input.userId,
        })
        .select("id, list_id, title, position")
        .single();
      if (error) throw new Error(error.message);
      return toCard(data)!;
    },
    async update(cardId: CardId, title: string): Promise<Card> {
      const { data, error } = await client
        .from("cards")
        .update({ title })
        .eq("id", cardId)
        .select("id, list_id, title, position")
        .single();
      if (error) throw new Error(error.message);
      return toCard(data)!;
    },
    async delete(cardId: CardId): Promise<void> {
      const { error } = await client
        .from("cards")
        .delete()
        .eq("id", cardId);
      if (error) throw new Error(error.message);
    },
  };
}