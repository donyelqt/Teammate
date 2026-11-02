/**
 * Domain surface for Teammate.
 *
 * This file is the single entry point for anything that needs the domain
 * types. It re-exports the identifiers and the sync state machine rather than
 * declaring them again, so there is one definition and every consumer imports
 * from one place.
 *
 * The identifiers live in `ids.ts` and the sync state in `sync-state.ts`.
 * Keeping them separate matters: ids are a pure type-level concern with a
 * single runtime check, while sync state carries a discriminated union whose
 * exhaustiveness is enforced by a `never` assertion. Merging them would make
 * both harder to reason about.
 */

export {
  isBoardId,
  isCardId,
  isCommentId,
  isListId,
  isUserId,
  isUuid,
  isWorkspaceId,
} from "./ids.js";
export type {
  BoardId,
  CardId,
  CommentId,
  ListId,
  UserId,
  Uuid,
  WorkspaceId,
} from "./ids.js";

export { syncBadge } from "./sync-state.js";
export type { QueuedMutation, SyncState } from "./sync-state.js";