declare const UuidBrand: unique symbol;
declare const WorkspaceIdBrand: unique symbol;
declare const BoardIdBrand: unique symbol;
declare const ListIdBrand: unique symbol;
declare const CardIdBrand: unique symbol;
declare const CommentIdBrand: unique symbol;
declare const UserIdBrand: unique symbol;

export type Uuid = string & { readonly [UuidBrand]: "Uuid" };

export type WorkspaceId = string & {
  readonly [WorkspaceIdBrand]: "WorkspaceId";
};
export type BoardId = string & { readonly [BoardIdBrand]: "BoardId" };
export type ListId = string & { readonly [ListIdBrand]: "ListId" };
export type CardId = string & { readonly [CardIdBrand]: "CardId" };
export type CommentId = string & {
  readonly [CommentIdBrand]: "CommentId";
};
export type UserId = string & { readonly [UserIdBrand]: "UserId" };

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