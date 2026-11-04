import { ulid, ulidToUUID } from "ulid";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCardId, isCommentId, isUserId } from "@teammate/shared";

export interface CardComment {
  id: string;
  card_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

const CommentRowSchema = {
  parse(row: unknown): CardComment {
    if (!row || typeof row !== "object") throw new Error("invalid comment row");
    const r = row as Record<string, unknown>;
    if (!isCommentId(r["id"])) throw new Error("invalid comment id");
    if (!isCardId(r["card_id"])) throw new Error("invalid card id");
    if (!isUserId(r["author_id"])) throw new Error("invalid author id");
    if (typeof r["body"] !== "string") throw new Error("invalid body");
    if (typeof r["created_at"] !== "string") throw new Error("invalid created_at");
    return {
      id: r["id"] as string,
      card_id: r["card_id"] as string,
      author_id: r["author_id"] as string,
      body: r["body"],
      created_at: r["created_at"],
    };
  },
};

export function toComment(row: unknown): CardComment | null {
  try {
    return CommentRowSchema.parse(row);
  } catch {
    return null;
  }
}

export interface CommentRepository {
  list(cardId: string): Promise<CardComment[]>;
  create(cardId: string, body: string, authorId: string): Promise<CardComment>;
  delete(commentId: string): Promise<void>;
}

export function createCommentRepository(
  client: SupabaseClient,
): CommentRepository {
  return {
    async list(cardId: string): Promise<CardComment[]> {
      const { data, error } = await client
        .from("comments")
        .select("id, card_id, author_id, body, created_at")
        .eq("card_id", cardId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => toComment(r)!).filter(Boolean) as CardComment[];
    },
    async create(cardId: string, body: string, authorId: string): Promise<CardComment> {
      const id = ulidToUUID(ulid());
      const { data, error } = await client
        .from("comments")
        .insert({
          id,
          card_id: cardId,
          body,
          author_id: authorId,
        })
        .select("id, card_id, author_id, body, created_at")
        .single();
      if (error) throw new Error(error.message);
      return toComment(data)!;
    },
    async delete(commentId: string): Promise<void> {
      const { error } = await client
        .from("comments")
        .delete()
        .eq("id", commentId);
      if (error) throw new Error(error.message);
    },
  };
}