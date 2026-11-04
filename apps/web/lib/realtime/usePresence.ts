import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createPresenceRepository } from "@/lib/cards/presenceRepository";
import type { UserId } from "@teammate/shared";
import { isUserId } from "@teammate/shared";

export interface CardPresence {
  card_id: string;
  user_id: string;
  editor_session: string;
  last_seen: string;
}

export interface UsePresenceOptions {
  boardId: string;
  cardId?: string;
  intervalMs?: number;
  ttlMs?: number;
}

export interface UsePresenceResult {
  presenceByCard: Record<string, CardPresence[]>;
  startEditing: (cardId: string) => void;
  stopEditing: (cardId: string) => void;
}

export type PresenceRepositoryRef = ReturnType<
  typeof createPresenceRepository
>;

export function usePresence(
  options: UsePresenceOptions,
): UsePresenceResult {
  const { boardId, cardId, intervalMs = 30000, ttlMs = 120000 } = options;

  const [presenceByCard, setPresenceByCard] = useState<
    Record<string, CardPresence[]>
  >({});

  const editingRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef<UserId | null>(null);
  const sessionRef = useRef<string>("");
  const repoRef = useRef<PresenceRepositoryRef | null>(null);
  const channelRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resolve current user id once on mount
  useEffect(() => {
    const supabase = createClient();
    repoRef.current = createPresenceRepository(supabase);

    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (token) {
        try {
          const parts = token.split(".");
          const payload = parts[1];
          if (payload) {
            const sub = JSON.parse(
              atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
            ).sub;
            if (sub && isUserId(sub)) {
              userIdRef.current = sub;
            }
          }
        } catch {
          // ignore
        }
      }
      sessionRef.current = crypto.randomUUID();
    });
  }, []);

  // Subscribe to realtime changes on card_presence for this board
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("presence:" + boardId);

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "card_presence",
          filter: "board_id=eq." + boardId,
        },
        (payload: unknown) => {
          const maybeNew = (payload as { new?: unknown }).new;
          const row =
            maybeNew !== undefined
              ? maybeNew
              : (payload as { old?: unknown }).old;
          if (!row || typeof row !== "object") return;
          const r = row as Record<string, unknown>;
          if (typeof r.card_id !== "string") return;
          if (typeof r.user_id !== "string") return;
          if (typeof r.editor_session !== "string") return;
          if (typeof r.last_seen !== "string") return;
          const entry: CardPresence = {
            card_id: r.card_id,
            user_id: r.user_id,
            editor_session: r.editor_session,
            last_seen: r.last_seen,
          };
          setPresenceByCard((prev) => {
            const next: Record<string, CardPresence[]> = {};
            for (const [k, v] of Object.entries(prev)) {
              if (k === entry.card_id) {
                next[k] = [
                  entry,
                  ...v.filter((p) => p.card_id !== entry.card_id),
                ];
              } else {
                next[k] = v;
              }
            }
            if (!next[entry.card_id]) next[entry.card_id] = [entry];
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId]);

  // Periodic prune: drop rows older than ttlMs
  useEffect(() => {
    const prune = () => {
      const cutoff = Date.now() - ttlMs;
      setPresenceByCard((prev) => {
        const next: Record<string, CardPresence[]> = {};
        for (const [k, v] of Object.entries(prev)) {
          const filtered = v.filter(
            (p) => new Date(p.last_seen).getTime() > cutoff,
          );
          if (filtered.length > 0) next[k] = filtered;
        }
        return next;
      });
    };
    const id = setInterval(prune, Math.min(ttlMs, 60000));
    return () => {
      clearInterval(id);
    };
  }, [ttlMs]);

  // Heartbeat: upsert presence for every card currently being edited
  useEffect(() => {
    const tick = async () => {
      const repo = repoRef.current;
      const userId = userIdRef.current;
      const session = sessionRef.current;
      if (!repo || !userId || !session) return;
      for (const cid of editingRef.current) {
        try {
          await repo.upsert(cid, userId, session);
        } catch {
          // best-effort
        }
      }
    };
    const id = setInterval(tick, intervalMs);
    timerRef.current = id;
    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);

  const startEditing = (cardId: string) => {
    editingRef.current.add(cardId);
    // immediate heartbeat
    const repo = repoRef.current;
    const userId = userIdRef.current;
    const session = sessionRef.current;
    if (repo && userId && session) {
      void repo.upsert(cardId, userId, session);
    }
  };

  const stopEditing = (cardId: string) => {
    editingRef.current.delete(cardId);
    const repo = repoRef.current;
    const session = sessionRef.current;
    if (repo && session) {
      void repo.delete(cardId, session);
    }
    // remove from local state
    setPresenceByCard((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
  };

  // Cleanup on unmount: delete our session's rows, unsubscribe
  useEffect(() => {
    return () => {
      const repo = repoRef.current;
      const session = sessionRef.current;
      if (repo && session) {
        for (const cid of editingRef.current) {
          void repo.delete(cid, session);
        }
      }
    };
  }, []);

  return { presenceByCard, startEditing, stopEditing };
}