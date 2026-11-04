"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { BoardId } from "@teammate/shared";
import { isBoardId, isListId } from "@teammate/shared";

import {
  useRealtimeChannel,
  type RealtimeCardEvent,
} from "@/../lib/realtime/useRealtimeChannel";
import { createClient } from "@/lib/supabase/client";

const CardSchema = z.object({
  id: z.string(),
  list_id: z.string(),
  title: z.string(),
  position: z.number(),
});

const ListSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
});

const ListRowSchema = z.array(ListSchema);
const CardRowSchema = z.array(CardSchema);

type List = z.infer<typeof ListSchema>;
type Card = z.infer<typeof CardSchema>;

interface BoardData {
  readonly lists: List[];
  readonly cards: Card[];
}

function sortCards(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => a.position - b.position);
}

function sortLists(lists: List[]): List[] {
  return lists.slice().sort((a, b) => a.position - b.position);
}

export function BoardShell({ boardId }: { boardId: string }) {
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const supabase = createClient();
    const listQuery = supabase
      .from("lists")
      .select("id, name, position")
      .eq("board_id", boardId);
    const listResult = await listQuery;
    if (listResult.error) {
      throw new Error(listResult.error.message);
    }
    const lists = ListRowSchema.parse(listResult.data ?? []);
    const ids = lists.map((list) => list.id);
    listIdsRef.current = new Set(ids);

    let cards: Card[] = [];
    if (ids.length > 0) {
      const cardResult = await supabase
        .from("cards")
        .select("id, list_id, title, position")
        .in("list_id", ids)
        .is("archived_at", null);
      if (cardResult.error) {
        throw new Error(cardResult.error.message);
      }
      cards = CardRowSchema.parse(cardResult.data ?? []);
    }
    return { lists: sortLists(lists), cards: sortCards(cards) };
  }, [boardId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const handleEvent = useCallback(
    (event: RealtimeCardEvent) => {
      if (event.event === "DELETE") {
        const cardId = event.cardId;
        if (!cardId) return;
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            cards: prev.cards.filter((c) => c.id !== cardId),
          };
        });
        return;
      }

      const card = event.card;
      const cardListId = card.list_id;
      if (!listIdsRef.current.has(cardListId)) return;

      setData((prev) => {
        if (!prev) return prev;
        const nextCard: Card = {
          id: card.id,
          list_id: card.list_id,
          title: card.title,
          position: card.position,
        };
        const exists = prev.cards.some((c) => c.id === nextCard.id);
        const cards = exists
          ? prev.cards.map((c) => (c.id === nextCard.id ? nextCard : c))
          : [...prev.cards, nextCard];
        return { ...prev, cards: sortCards(cards) };
      });
    },
    [],
  );

  const boardIdValue = isBoardId(boardId) ? boardId : (boardId as BoardId);
  const listIds = data
    ? data.lists.map((list) => list.id).filter(isListId)
    : undefined;
  const realtime = useRealtimeChannel(boardIdValue, {
    onEvent: handleEvent,
    listIds,
  });

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <p className="text-muted">Loading board…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <p className="text-error">{error}</p>
      </div>
    );
  }

  if (!data || data.lists.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <p className="text-muted">No lists yet. Add one to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold">Board</h1>
          <span
            data-testid="realtime-status"
            className="text-xs uppercase tracking-wide text-muted"
          >
            {realtime.status}
          </span>
        </div>
      </header>
      <main className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-4">
          {data.lists.map((list) => (
            <div
              key={list.id}
              className="w-72 shrink-0 rounded-lg bg-surface p-3"
            >
              <h2 className="mb-2 font-medium">{list.name}</h2>
              <div className="flex flex-col gap-2">
                {data.cards
                  .filter((card) => card.list_id === list.id)
                  .map((card) => (
                    <div
                      key={card.id}
                      className="rounded-md bg-background p-2 shadow-sm"
                    >
                      {card.title}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}