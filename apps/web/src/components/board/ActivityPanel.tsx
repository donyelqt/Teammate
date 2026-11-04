import { useEffect, useRef, useState } from "react";

export interface ActivityEvent {
  id: number;
  actor_id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ActivityPanelProps {
  events: ActivityEvent[];
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function actorLabel(event: ActivityEvent): string {
  const name = event.payload?.actor_name;
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  return event.actor_id.slice(0, 8);
}

function targetLabel(event: ActivityEvent): string {
  const target = event.payload?.target;
  if (typeof target === "string" && target.trim().length > 0) return target;
  const cardId = event.payload?.card_id;
  if (typeof cardId === "string" && cardId.trim().length > 0) return cardId;
  const boardId = event.payload?.board_id;
  if (typeof boardId === "string" && boardId.trim().length > 0) return boardId;
  return "—";
}

export function ActivityPanel({
  events,
  loading,
  onRefresh,
  onClose,
}: ActivityPanelProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [topHidden, setTopHidden] = useState(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      setTopHidden(el.scrollTop > 4);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [events.length]);

  return (
    <div className="fixed right-0 top-0 z-20 flex h-full w-80 max-w-[80vw] flex-col border-l border-border bg-surface shadow-lg">
      <div
        className={`flex items-center justify-between border-b border-border px-4 py-3 transition-[padding] duration-200 ${topHidden ? "py-1.5" : "py-3"}`}
      >
        <h2 className="text-sm font-semibold">Activity</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground"
          aria-label="Close activity panel"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <ul
        ref={listRef}
        className="flex-1 overflow-y-auto divide-y divide-border"
      >
        {loading ? (
          <>
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
                <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
                <div className="h-4 w-20 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </>
        ) : events.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted">
            No activity yet.
          </li>
        ) : (
          events.map((event) => (
            <li key={event.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-16 shrink-0 text-xs text-muted">
                {relativeTime(event.created_at)}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {actorLabel(event)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {event.kind}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {targetLabel(event)}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}