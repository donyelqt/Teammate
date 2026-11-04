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
      id: r["id"] as CardId,
      list_id: r["list_id"] as ListId,
      title: r["title"] as string,
      position: r["position"] as number,
      labels: Array.isArray(r["labels"]) ? (r["labels"] as string[]) : [],
      assignee_ids: Array.isArray(r["assignee_ids"]) ? (r["assignee_ids"] as CardId[]) : [],
      due_at: (r["due_at"] as string | null) ?? null,
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
    id: CardId;
    listId: ListId;
    title: string;
    position: number;
    userId: UserId;
  }): Promise<Card>;
  update(cardId: CardId, patch: { title?: string; labels?: string[]; assignee_ids?: string[]; due_at?: string | null }): Promise<Card>;
  move(cardId: CardId, listId: ListId, position: number): Promise<void>;
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
      return (data ?? []).map((r) => toCard(r)!).filter(Boolean) as Card[];
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
    async update(cardId: CardId, patch: { title?: string; labels?: string[]; assignee_ids?: string[]; due_at?: string | null }): Promise<Card> {
      const { data, error } = await client
        .from("cards")
        .update({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.labels !== undefined ? { labels: patch.labels } : {}),
          ...(patch.assignee_ids !== undefined ? { assignee_ids: patch.assignee_ids } : {}),
          ...(patch.due_at !== undefined ? { due_at: patch.due_at } : {}),
        })
        .eq("id", cardId)
        .select("id, list_id, title, position, labels, assignee_ids, due_at")
        .single();
      if (error) throw new Error(error.message);
      return toCard(data)!;
    },
    async move(cardId: CardId, listId: ListId, position: number): Promise<void> {
      const { error } = await client
        .from("cards")
        .update({ list_id: listId, position })
        .eq("id", cardId);
      if (error) throw new Error(error.message);
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