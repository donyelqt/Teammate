import { useCallback, useRef, useState } from "react";
import type { Card } from "@/../lib/cards/cardReducer";

import type { CardComment } from "@/lib/cards/commentRepository";
import { Comments } from "./Comments";
interface CardItemProps {
  card: Card;
  editing: boolean;
  editTitle: string;
  onEditStart: (card: Card) => void;
  onEditChange: (title: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (card: Card) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDragLeave: () => void;
  onDrop: (draggedId: string, targetId: string) => void;
  isDraggingOver: boolean;
  isPending: boolean;
  onEditLabels: (cardId: string, labels: string[]) => void;
  onEditAssignees: (cardId: string, assignee_ids: string[]) => void;
  onEditDueDate: (cardId: string, due_at: string | null) => void;
  presence: string[];
  comments: CardComment[];
  currentUserId: string | null;
  onAddComment: (body: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export function CardItem({
  card,
  editing,
  editTitle,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDraggingOver,
  isPending,
  onEditLabels,
  onEditAssignees,
  onEditDueDate,
  presence,
  comments,
  currentUserId,
  onAddComment,
  onDeleteComment,
}: CardItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [_dragOver, setDragOver] = useState(false);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onEditSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onEditCancel();
      }
    },
    [onEditSave, onEditCancel],
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData("card/id", card.id);
      event.dataTransfer.setData("card/list_id", card.list_id);
      event.dataTransfer.effectAllowed = "move";
      onDragStart(card.id);
    },
    [card.id, card.list_id, onDragStart],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      onDragOver(card.id);
    },
    [card.id, onDragOver],
  );

  const handleDragEnter = useCallback(() => {
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
    onDragLeave();
  }, [onDragLeave]);

  const handleDrop = useCallback(() => {
    setDragOver(false);
    onDrop(card.id, card.id);
  }, [card.id, onDrop]);

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-md bg-background p-2 shadow-sm">
        <input
          ref={inputRef}
          type="text"
          value={editTitle}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onEditSave}
          placeholder="Card title…"
          className="w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onEditSave}
            className="rounded bg-accent px-2 py-1 text-xs text-accent-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onEditCancel}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center justify-between gap-2 rounded-md bg-background p-2 shadow-sm ${
        isDraggingOver ? "border-accent" : isPending ? "opacity-60" : ""
      }`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col gap-2 w-full">
        <div className="flex items-center gap-2">
          <span
            role="button"
            tabIndex={0}
            aria-label={`Edit card: ${card.title || "Untitled"}`}
            className="cursor-pointer text-sm hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
            onClick={() => onEditStart(card)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEditStart(card);
              }
            }}
          >
            {card.title || "Untitled"}
            {comments.length > 0 && (
              <span className="flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
                💬 {comments.length}
              </span>
            )}
            {presence.length > 0 && (
              <span
                title={`Editing: ${presence.join(", ")}`}
                className="flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent"
              >
                ✏️ {presence.length}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => onDelete(card)}
            aria-label="Delete card"
            className="hidden text-muted hover:text-error group-hover:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
          >
            ×
          </button>
        </div>

        {card.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.labels.map((label) => (
              <span
                key={label}
                className="rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {card.assignee_ids.length > 0 && (
          <div className="flex gap-1">
            {card.assignee_ids.map((assigneeId) => (
              <span
                key={assigneeId}
                className="rounded-full bg-surface px-2 py-0.5 text-xs border border-border"
              >
                {assigneeId.slice(0, 2).toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {card.due_at && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">📅 {card.due_at}</span>
          </div>
        )}
        <Comments
          cardId={card.id}
          comments={comments}
          currentUserId={currentUserId}
          onAdd={onAddComment}
          onDelete={onDeleteComment}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => onEditLabels(card.id, [...card.labels as string[]])}
          className="rounded border border-border px-2 py-1 text-xs text-muted hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Labels
        </button>
        <button
          type="button"
          onClick={() => onEditAssignees(card.id, [...card.assignee_ids])}
          className="rounded border border-border px-2 py-1 text-xs text-muted hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Assignees
        </button>
        <button
          type="button"
          onClick={() => onEditDueDate(card.id, card.due_at)}
          className="rounded border border-border px-2 py-1 text-xs text-muted hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Due date
        </button>
      </div>
    </div>
  );
}

interface AddCardProps {
  adding: boolean;
  addTitle: string;
  onAddStart: () => void;
  onAddChange: (title: string) => void;
  onAddSubmit: () => void;
  onAddCancel: () => void;
}

export function AddCard({
  adding,
  addTitle,
  onAddStart,
  onAddChange,
  onAddSubmit,
  onAddCancel,
}: AddCardProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onAddSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onAddCancel();
      }
    },
    [onAddStart, onAddSubmit, onAddCancel],
  );

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => {
          onAddStart();
          onAddChange("");
        }}
          className="w-full rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        + Add a card
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2">
      <input
        type="text"
        value={addTitle}
        onChange={(e) => onAddChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onAddSubmit}
        placeholder="Enter a card title…"
        autoFocus
          className="w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onAddSubmit}
          className="rounded bg-accent px-2 py-1 text-xs text-accent-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Add card
        </button>
        <button
          type="button"
          onClick={onAddCancel}
          className="rounded border border-border px-2 py-1 text-xs hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}