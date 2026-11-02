"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

import { createApiClient } from "@/lib/api/client";

const CardSchema = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number(),
});

const ListSchema = z.object({
  id: z.string(),
  name: z.string(),
  cards: z.array(CardSchema),
});

const ListsSchema = z.array(ListSchema);

type List = z.infer<typeof ListSchema>;

export function BoardShell({ boardId }: { boardId: string }) {
  const [lists, setLists] = useState<List[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = createApiClient();
    client
      .get(`/boards/${boardId}/lists`, ListsSchema)
      .then((data) => {
        setLists(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
  }, [boardId]);

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

  if (!lists || lists.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <p className="text-muted">No lists yet. Add one to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <h1 className="text-lg font-semibold">Board</h1>
      </header>
      <main className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-4">
          {lists.map((list) => (
            <div
              key={list.id}
              className="w-72 shrink-0 rounded-lg bg-surface p-3"
            >
              <h2 className="mb-2 font-medium">{list.name}</h2>
              <div className="flex flex-col gap-2">
                {list.cards.map((card) => (
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
