"use client";
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
  const [dragOver, setDragOver] = useState(false);
  const [editingLabels, setEditingLabels] = useState(false);
  const [editingAssignees, setEditingAssignees] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [assigneeInput, setAssigneeInput] = useState("");
  const [dueDate, setDueDate] = useState(card.due_at || "");

  const handleEditStart = useCallback(() => {
    onEditStart(card);
  }, [card, onEditStart]);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(card.id)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(card.id);
        setDragOver(true);
      }}
      onDragLeave={() => {
        onDragLeave();
        setDragOver(false);
      }}
      onDrop={() => {
        onDrop(card.id, card.id);
        setDragOver(false);
      }}
      className={`group relative rounded-lg border-2 border-border bg-surface p-3 shadow-brutal transition-all duration-150 hover:-translate-y-0.5 hover:shadow-brutal-sm ${
        isDraggingOver ? "ring-2 ring-accent ring-offset-2" : ""
      } ${isPending ? "opacity-60" : ""}`}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={editTitle}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEditSave();
            if (e.key === "Escape") onEditCancel();
          }}
          className="w-full rounded-md border-2 border-border bg-background px-2 py-1 text-sm font-bold outline-none focus:border-accent"
          autoFocus
        />
      ) : (
        <div className="flex items-start justify-between gap-2">
          <span
            onClick={handleEditStart}
            className="flex-1 cursor-pointer text-sm font-bold text-surface-foreground hover:text-accent"
          >
            {card.title}
          </span>
          <button
            onClick={() => onDelete(card)}
            className="opacity-0 group-hover:opacity-100 text-muted hover:text-error transition-opacity"
            aria-label="Delete card"
          >
            ×
          </button>
        </div>
      )}

      {/* Labels */}
      {card.labels && card.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.labels.map((label, i) => (
            <span
              key={i}
              className="inline-block rounded-full border border-border bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Assignees */}
      {card.assignee_ids && card.assignee_ids.length > 0 && (
        <div className="mt-2 flex -space-x-1">
          {card.assignee_ids.map((assigneeId, i) => (
            <div
              key={i}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-border bg-primary text-[9px] font-bold text-primary-foreground"
            >
              {String(assigneeId).slice(0, 2).toUpperCase()}
            </div>
          ))}
        </div>
      )}

      {/* Due date */}
      {card.due_at && (
        <div className="mt-2 text-[10px] font-bold text-muted">
          📅 {new Date(card.due_at).toLocaleDateString()}
        </div>
      )}

      {/* Comments */}
      <Comments
        cardId={card.id}
        comments={comments}
        currentUserId={currentUserId}
        onAdd={onAddComment}
        onDelete={onDeleteComment}
      />

      {/* Presence */}
      {presence && presence.length > 0 && (
        <div className="mt-2 text-[10px] font-bold text-accent">
          ✏️ {presence.join(", ")}
        </div>
      )}

      {/* Edit controls */}
      <div className="mt-2 flex gap-1">
        <button
          onClick={() => setEditingLabels(!editingLabels)}
          className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-surface-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          + Label
        </button>
        <button
          onClick={() => setEditingAssignees(!editingAssignees)}
          className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-surface-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          + Assignee
        </button>
        <button
          onClick={() => setEditingDueDate(!editingDueDate)}
          className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-surface-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          📅 Due
        </button>
      </div>

      {/* Label input */}
      {editingLabels && (
        <div className="mt-2 flex gap-1">
          <input
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="Label name"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            onClick={() => {
              if (labelInput.trim()) {
                onEditLabels(card.id, [...card.labels, labelInput.trim()]);
                setLabelInput("");
                setEditingLabels(false);
              }
            }}
            className="rounded-md border border-border bg-accent px-2 py-1 text-xs font-bold text-accent-foreground"
          >
            Add
          </button>
        </div>
      )}

      {/* Assignee input */}
      {editingAssignees && (
        <div className="mt-2 flex gap-1">
          <input
            value={assigneeInput}
            onChange={(e) => setAssigneeInput(e.target.value)}
            placeholder="User ID"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            onClick={() => {
              if (assigneeInput.trim()) {
                onEditAssignees(card.id, [
                  ...card.assignee_ids,
                  assigneeInput.trim(),
                ]);
                setAssigneeInput("");
                setEditingAssignees(false);
              }
            }}
            className="rounded-md border border-border bg-accent px-2 py-1 text-xs font-bold text-accent-foreground"
          >
            Add
          </button>
        </div>
      )}

      {/* Due date input */}
      {editingDueDate && (
        <div className="mt-2 flex gap-1">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            onClick={() => {
              onEditDueDate(card.id, dueDate || null);
              setEditingDueDate(false);
            }}
            className="rounded-md border border-border bg-accent px-2 py-1 text-xs font-bold text-accent-foreground"
          >
            Save
          </button>
        </div>
      )}
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
        onClick={() => {
          onAddStart();
          onAddChange("");
        }}
        className="w-full rounded-md border-2 border-dashed border-border bg-surface-2 px-2 py-1.5 text-sm font-bold text-muted hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        + Add a card
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-border bg-surface p-2 shadow-brutal">
      <input
        type="text"
        value={addTitle}
        onChange={(e) => onAddChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onAddSubmit}
        placeholder="Enter a card title…"
        autoFocus
        className="w-full rounded-md border-2 border-border bg-background px-2 py-1 text-sm font-bold outline-none focus:border-accent"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onAddCancel}
          className="rounded-md border-2 border-border bg-surface-2 px-3 py-1 text-xs font-bold text-surface-foreground hover:bg-surface transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onAddSubmit}
          className="rounded-md border-2 border-border bg-accent px-3 py-1 text-xs font-bold text-accent-foreground hover:opacity-90 transition-opacity"
        >
          Add
        </button>
      </div>
    </div>
  );
}
