declare const brand: unique symbol;

type Brand<name extends string> = {
  readonly [brand]: name;
};

export type Uuid = string & Brand<"Uuid">;

export type WorkspaceId = Uuid & Brand<"WorkspaceId">;
export type BoardId = Uuid & Brand<"BoardId">;
export type ListId = Uuid & Brand<"ListId">;
export type CardId = Uuid & Brand<"CardId">;
export type CommentId = Uuid & Brand<"CommentId">;
export type UserId = Uuid & Brand<"UserId">;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is Uuid {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return isUuid(value);
}

export function isBoardId(value: unknown): value is BoardId {
  return isUuid(value);
}

export function isListId(value: unknown): value is ListId {
  return isUuid(value);
}

export function isCardId(value: unknown): value is CardId {
  return isUuid(value);
}

export function isCommentId(value: unknown): value is CommentId {
  return isUuid(value);
}

export function isUserId(value: unknown): value is UserId {
  return isUuid(value);
}
