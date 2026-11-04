"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ulid, ulidToUUID } from "ulid";
import { z } from "zod";
import type { BoardId, CardId, ListId, UserId } from "@teammate/shared";
import { isBoardId, isListId, isUserId } from "@teammate/shared";

import {
  useRealtimeChannel,
  type RealtimeCardEvent,
} from "@/lib/realtime/useRealtimeChannel";
import {
  createCardState,
  cardReducer,
  isPending,
  type Card,
} from "@/lib/cards/cardReducer";
import { createCardRepository } from "@/lib/cards/cardRepository";
import { createClient } from "@/lib/supabase/client";
import { AddCard, CardItem } from "@/components/card/Card";
import {
  createCommentRepository,
  toComment,
  type CardComment,
} from "@/lib/cards/commentRepository";
import { Comments } from "@/components/card/Comments";
import { ActivityPanel, type ActivityEvent } from "@/components/board/ActivityPanel";
import {
  usePresence,
  type CardPresence,
} from "@/lib/realtime/usePresence";
import { createActivityRepository } from "@/lib/activity/activityRepository";

const ListSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
});

interface BoardList {
  id: ListId;
  name: string;
  position: number;
}

function sortLists(lists: BoardList[]): BoardList[] {
  return lists.slice().sort((a, b) => a.position - b.position);
}

export function BoardShell({ boardId }: { boardId: string }) {
  const [lists, setLists] = useState<BoardList[]>([]);
  const [cardState, dispatch] = useReducer(
    cardReducer,
    undefined,
    createCardState,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [addingToListId, setAddingToListId] = useState<ListId | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [editingCardId, setEditingCardId] = useState<CardId | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [dragOverCardId, setDragOverCardId] = useState<CardId | null>(null);
  const draggedCardIdRef = useRef<CardId | null>(null);

  const listIdsRef = useRef<ListId[]>([]);
  const repositoryRef = useRef<ReturnType<typeof createCardRepository> | null>(
    null,
  );
  const userIdRef = useRef<UserId | null>(null);
  const [commentsByCard, setCommentsByCard] = useState<Record<string, CardComment[]>>({});
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    repositoryRef.current = createCardRepository(supabase);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (token) {
      try {
        const parts = token.split(".");
        const payload = parts[1]!;
        if (!payload) throw new Error("no payload");
        const sub = JSON.parse(
          atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
        ).sub;
        if (sub && isUserId(sub)) {
          userIdRef.current = sub;
        }
      } catch {
        // ignore malformed token; inserts will surface the RLS error
      }
    }

    const { data: listRows, error: listError } = await supabase
      .from("lists")
      .select("id, name, position")
      .eq("board_id", boardId);
    if (listError) throw new Error(listError.message);

    const parsedLists = (listRows ?? []).map((row) => {
      const parsed = ListSchema.parse(row);
      if (!isListId(parsed.id)) throw new Error("invalid list id");
      return { id: parsed.id, name: parsed.name, position: parsed.position };
    });
    const sortedLists = sortLists(parsedLists);
    setLists(sortedLists);
    const ids = sortedLists.map((l) => l.id);
    listIdsRef.current = ids;

    const cards = await repositoryRef.current.list(ids);
    dispatch({ type: "hydrate", cards });
  }, [boardId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .then(() => {
        if (!active) return;
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

  const handleEvent = useCallback((event: RealtimeCardEvent) => {
    if (event.event === "DELETE") {
      const cardId = event.cardId;
      if (cardId) {
        dispatch({ type: "remoteDelete", cardId });
      }
      return;
    }
    const card = event.card as Card;
    if (!listIdsRef.current.includes(card.list_id)) return;
    dispatch({ type: "remoteUpsert", card });
  }, []);

  const boardIdValue = isBoardId(boardId) ? boardId : (boardId as BoardId);
  useRealtimeChannel(boardIdValue, {
    onEvent: handleEvent,
    listIds: listIdsRef.current,
  });
  const {
    presenceByCard,
    startEditing: startPresenceEditing,
    stopEditing: stopPresenceEditing,
  } = usePresence({ boardId: boardIdValue });

  const loadComments = useCallback(async (cardId: string) => {
    const supabase = createClient();
    const repo = createCommentRepository(supabase);
    try {
      const comments = await repo.list(cardId);
      setCommentsByCard((prev) => ({ ...prev, [cardId]: comments }));
    } catch {
      // ignore; realtime will reconcile
    }
  }, []);

  const onAddComment = useCallback(
    (cardId: string, body: string) => {
      const userId = userIdRef.current;
      if (!userId) return;
      const tempId = ulid();
      const optimistic: CardComment = {
        id: tempId,
        card_id: cardId,
        author_id: userId,
        body,
        created_at: new Date().toISOString(),
      };
      setCommentsByCard((prev) => ({
        ...prev,
        [cardId]: [...(prev[cardId] ?? []), optimistic],
      }));
      const supabase = createClient();
      const repo = createCommentRepository(supabase);
      void repo
        .create(cardId, body, userId)
        .then((created) => {
          setCommentsByCard((prev) => ({
            ...prev,
            [cardId]: (prev[cardId] ?? []).map((c) =>
              c.id === tempId ? created : c,
            ),
          }));
        })
        .catch(() => {
          setCommentsByCard((prev) => ({
            ...prev,
            [cardId]: (prev[cardId] ?? []).filter((c) => c.id !== tempId),
          }));
        });
    },
    [],
  );

  const onDeleteComment = useCallback(
    (cardId: string, commentId: string) => {
      setCommentsByCard((prev) => ({
        ...prev,
        [cardId]: (prev[cardId] ?? []).filter((c) => c.id !== commentId),
      }));
      const supabase = createClient();
      const repo = createCommentRepository(supabase);
      void repo.delete(commentId).catch(() => {
        void loadComments(cardId);
      });
    },
    [loadComments],
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("comments-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
        },
        (payload) => {
          const comment = toComment(payload.new);
          if (!comment) return;
          setCommentsByCard((prev) => ({
            ...prev,
            [comment.card_id]: [
              ...(prev[comment.card_id] ?? []),
              comment,
            ],
          }));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "comments",
        },
        (payload) => {
          const oldRow = payload.old as { id?: unknown } | undefined;
          if (!oldRow || typeof oldRow.id !== "string") return;
          const commentId = oldRow.id;
          setCommentsByCard((prev) => {
            const next: Record<string, CardComment[]> = {};
            for (const [cid, comments] of Object.entries(prev)) {
              next[cid] = comments.filter((c) => c.id !== commentId);
            }
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);


  const createCard = useCallback(
    async (listId: ListId, title: string) => {
      const trimmed = title.trim();
      const repo = repositoryRef.current;
      const userId = userIdRef.current;
      if (!trimmed || !repo || !userId) return;

      const cardId = ulidToUUID(ulid()).toLowerCase() as CardId;
      const position =
        cardState.cards.filter((c) => c.list_id === listId).length > 0
          ? Math.max(
              ...cardState.cards
                .filter((c) => c.list_id === listId)
                .map((c) => c.position),
            ) + 1
          : 0;

      const optimisticCard: Card = {
        id: cardId,
        list_id: listId,
        title: trimmed,
        position,
        labels: [],
        assignee_ids: [],
        due_at: null,
      };
      dispatch({
        type: "optimistic",
        mutation: { kind: "create", card: optimisticCard },
      });

      try {
        await repo.create({
          id: cardId,
          listId,
          title: trimmed,
          position,
          userId,
        });
        dispatch({ type: "ack", cardId });
      } catch (err: unknown) {
        setNotice(
          err instanceof Error ? err.message : "Could not create card",
        );
        setAddingToListId(listId);
        setAddTitle(trimmed);
      }
    },
    [cardState.cards],
  );

  const saveCard = useCallback(
    async (cardId: CardId, patch: { title?: string; labels?: string[]; assignee_ids?: CardId[]; due_at?: string | null }) => {
      const repo = repositoryRef.current;
      if (!repo) return;
      dispatch({
        type: "optimistic",
        mutation: { kind: "update", cardId, ...patch },
      });
      try {
        await repo.update(cardId, patch);
        dispatch({ type: "ack", cardId });
      } catch {
        setNotice("Could not save card. Reload to resync.");
      }
    },
    [],
  );
  const onEditLabels = useCallback(
    (cardId: string, labels: string[]) => {
      void saveCard(cardId as CardId, { labels });
    },
    [saveCard],
  );

  const onEditAssignees = useCallback(
    (cardId: string, assignee_ids: string[]) => {
      void saveCard(cardId as CardId, { assignee_ids: assignee_ids as CardId[] });
    },
    [saveCard],
  );

  const onEditDueDate = useCallback(
    (cardId: string, due_at: string | null) => {
      void saveCard(cardId as CardId, { due_at });
    },
    [saveCard],
  );

  const deleteCard = useCallback(async (cardId: CardId) => {
    const repo = repositoryRef.current;
    if (!repo) return;
    dispatch({ type: "optimistic", mutation: { kind: "delete", cardId } });
    try {
      await repo.delete(cardId);
      dispatch({ type: "ack", cardId });
    } catch {
      setNotice("Could not delete card. Reload to resync.");
    }
  }, []);

  const moveCard = useCallback(
    async (cardId: CardId, listId: ListId, position: number) => {
      const repo = repositoryRef.current;
      if (!repo) return;
      dispatch({
        type: "optimistic",
        mutation: { kind: "move", cardId, listId, position },
      });
      try {
        await repo.move(cardId, listId, position);
        dispatch({ type: "ack", cardId });
      } catch {
        setNotice("Could not move card. Reload to resync.");
      }
    },
    [],
  );

function toActivityRow(row: unknown): ActivityEvent | null {
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
    actor_id: r.actor_id,
    kind: r.kind,
    payload: safePayload,
    created_at: r.created_at,
  };
}

const loadActivity = useCallback(async () => {
  setActivityLoading(true);
  try {
    const supabase = createClient();
    const repo = createActivityRepository(supabase);
    const events = await repo.list(boardId, 50);
    setActivityEvents(events);
  } finally {
    setActivityLoading(false);
  }
}, [boardId]);

useEffect(() => {
  void loadActivity();
}, [loadActivity]);

useEffect(() => {
  let active = true;
  const supabase = createClient();
  const channel = supabase
    .channel(`activity:${boardId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "activity_events",
        filter: `board_id=eq.${boardId}`,
      },
      (payload: { new: unknown }) => {
        const event = toActivityRow(payload.new);
        if (!event || !active) return;
        setActivityEvents((prev) => {
          if (prev.some((e) => e.id === event.id)) return prev;
          return [event, ...prev];
        });
      },
    )
    .subscribe();
  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}, [boardId]);

  const refresh = useCallback(() => {
    setNotice(null);
    setAddingToListId(null);
    setEditingCardId(null);
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load");
    });
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <p className="text-muted">Loading board…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3">
        <p className="text-error">{error}</p>
        <button
          type="button"
          onClick={refresh}
          className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface"
        >
          Retry
        </button>
      </div>
    );
  }

  if (lists.length === 0) {
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
        <button
          type="button"
          onClick={() => setActivityPanelOpen((v) => !v)}
          className="ml-auto rounded border border-border px-3 py-1.5 text-sm hover:bg-surface"
        >
          Activity
        </button>
      </header>
      {notice ? (
        <p role="status" className="border-b border-warning px-4 py-2 text-sm text-warning">
          {notice}
        </p>
      ) : null}
      <main className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-4">
          {lists.map((list) => {
            const cards = cardState.cards.filter(
              (card) => card.list_id === list.id,
            );
            return (
              <section key={list.id} className="w-72 shrink-0 rounded-lg bg-surface p-3">
                <h2 className="mb-2 font-medium">{list.name}</h2>
                <div className="flex flex-col gap-2">
                  {cards.map((card) => (
                    <CardItem
                      key={card.id}
                      card={card}
                      editing={editingCardId === card.id}
                      editTitle={editTitle}
                      isPending={isPending(cardState, card.id)}
                      isDraggingOver={dragOverCardId === card.id}
                      presence={(
                        (presenceByCard[card.id] ?? []).filter(
                          (p: CardPresence) => p.user_id !== userIdRef.current,
                        ).map((p: CardPresence) => p.user_id.slice(0, 8))
                      )}
                      onEditStart={(target) => {
                        setEditingCardId(target.id);
                        setEditTitle(target.title);
                        startPresenceEditing(target.id);
                      }}
                      onEditChange={setEditTitle}
                      onEditSave={() => {
                        if (editingCardId) {
                          stopPresenceEditing(editingCardId);
                          void saveCard(editingCardId, { title: editTitle });
                        }
                      }}
                      onEditCancel={() => {
                        if (editingCardId) {
                          stopPresenceEditing(editingCardId);
                        }
                        setEditingCardId(null);
                      }}
                      onEditLabels={(cardId: string, labels: string[]) =>
                        void onEditLabels(cardId, labels)
                      }
                      onEditAssignees={(cardId: string, assignee_ids: string[]) =>
                        void onEditAssignees(cardId, assignee_ids)
                      }
                      onEditDueDate={(cardId: string, due_at: string | null) =>
                        void onEditDueDate(cardId, due_at)
                      }
                      onDelete={(target) => void deleteCard(target.id)}
                      onDragStart={(id) => {
                        draggedCardIdRef.current = id as CardId;
                      }}
                      onDragOver={(draggedCardId: string) => {
                        setDragOverCardId(
                          card.id === draggedCardId ? null : card.id,
                        );
                      }}
                      onDragLeave={() => setDragOverCardId(null)}
                      onDrop={(draggedCardId: string) => {
                        const targetId = card.id;
                        if (draggedCardId && draggedCardId !== targetId) {
                          const draggedCard = cardState.cards.find(
                            (c) => c.id === draggedCardId,
                          );
                          const targetCard = cardState.cards.find(
                            (c) => c.id === targetId,
                          );
                          if (draggedCard && targetCard) {
                            void moveCard(
                              draggedCardId as CardId,
                              targetCard.list_id,
                              targetCard.position,
                            );
                          }
                        }
                      }}
                      comments={commentsByCard[card.id] ?? []}
                      currentUserId={userIdRef.current}
                      onAddComment={(body: string) =>
                        void onAddComment(card.id, body)
                      }
                      onDeleteComment={(commentId: string) =>
                        void onDeleteComment(card.id, commentId)
                      }
                    />
                  ))}
                </div>
                <div className="mt-3">
                  <AddCard
                    adding={addingToListId === list.id}
                    addTitle={addTitle}
                    onAddStart={() => {
                      setAddingToListId(list.id);
                      setAddTitle("");
                    }}
                    onAddChange={setAddTitle}
                    onAddSubmit={() => {
                      const target = addingToListId;
                      setAddingToListId(null);
                      const title = addTitle;
                      setAddTitle("");
                      if (target) {
                        void createCard(target, title);
                      }
                    }}
                    onAddCancel={() => setAddingToListId(null)}
                  />
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}