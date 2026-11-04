import { useCallback, useRef, useState } from "react";
import type { Card } from "@/../lib/cards/cardReducer";

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
}: CardItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [_dragOver, setDragOver] = useState(false);
  // dragOver is used for drag visual feedback
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
          className="w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onEditSave}
            className="rounded bg-accent px-2 py-1 text-xs text-white hover:opacity-90"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onEditCancel}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-surface"
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
      <span
        className="cursor-pointer text-sm hover:text-accent"
        onClick={() => onEditStart(card)}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            onDelete(card);
          }
        }}
      >
        {card.title || "Untitled"}
      </span>
      <button
        type="button"
        onClick={() => onDelete(card)}
        aria-label="Delete card"
        className="hidden text-muted hover:text-error group-hover:block"
      >
        ×
      </button>
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
    [onAddSubmit, onAddCancel],
  );

  if (!adding) {
    return (
<button
        type="button"
        onClick={onAddStart}
        className="w-full rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted hover:bg-surface"
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
        className="w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onAddSubmit}
          className="rounded bg-accent px-2 py-1 text-xs text-white hover:opacity-90"
        >
          Add card
        </button>
        <button
          type="button"
          onClick={onAddCancel}
          className="rounded border border-border px-2 py-1 text-xs hover:bg-background"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}