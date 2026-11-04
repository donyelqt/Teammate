import { useCallback, useState } from "react";
import type { CardComment } from "@/lib/cards/commentRepository";

interface CommentsProps {
  cardId: string;
  comments: CardComment[];
  currentUserId: string | null;
  onAdd: (body: string) => void;
  onDelete: (commentId: string) => void;
}

export function Comments({
  cardId: _cardId,
  comments,
  currentUserId,
  onAdd,
  onDelete,
}: CommentsProps) {
  const [body, setBody] = useState("");

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const trimmed = body.trim();
        if (trimmed) {
          onAdd(trimmed);
          setBody("");
        }
      }
    },
    [body, onAdd],
  );

  const handleAdd = useCallback(() => {
    const trimmed = body.trim();
    if (trimmed) {
      onAdd(trimmed);
      setBody("");
    }
  }, [body, onAdd]);

  return (
    <div className="mt-2 flex flex-col gap-2">
      {comments.length === 0 ? (
        <p className="text-xs text-muted">No comments yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="flex items-start gap-2 rounded bg-surface p-2"
            >
              <span className="mt-0.5 shrink-0 text-xs text-muted">
                {comment.author_id.slice(0, 6)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm break-words">{comment.body}</p>
              </div>
              {currentUserId === comment.author_id && (
                <button
                  type="button"
                  onClick={() => onDelete(comment.id)}
                  aria-label="Delete comment"
                  className="shrink-0 text-muted hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <label className="sr-only" htmlFor="comment-body">
        Write a comment
      </label>
      <textarea
        id="comment-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write a comment…"
        rows={2}
        className="w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!body.trim()}
          className="rounded bg-accent px-2 py-1 text-xs text-accent-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Comment
        </button>
      </div>
    </div>
  );
}