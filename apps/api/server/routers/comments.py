"""Comment routes.

A comment is authored by the caller (`author_id = auth.uid()` is enforced by
RLS on insert). Deletion is allowed for the author or a workspace admin/owner
— that check lives in the `comments_delete` policy, not here.
"""

from __future__ import annotations

import uuid

import logging
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..core.auth import AuthUser, get_current_user
from ..core.db import get_db, set_user

log = logging.getLogger("teammate.comments")


def _stringify(record: dict) -> dict:
    """Coerce asyncpg UUID values to str for Pydantic."""
    return {
        k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in record.items()
    }

router = APIRouter()

AuthDep = Annotated[AuthUser, Depends(get_current_user)]
DbDep = Annotated[asyncpg.Connection, Depends(get_db)]

Cols = "id, card_id, author_id, body, created_at::text, updated_at::text"



async def _card_visible(conn: asyncpg.Connection, card_id: str) -> bool:
    """True when the caller can see the card under RLS."""
    row = await conn.fetchrow(
        "SELECT 1 FROM cards WHERE id = $1", card_id
    )
    return row is not None




class CommentResponse(BaseModel):
    id: str
    card_id: str
    author_id: str
    body: str
    created_at: str
    updated_at: str


class CreateCommentRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)


@router.get(
    "/cards/{card_id}/comments",
    response_model=list[CommentResponse],
    tags=["comments"],
)
async def list_comments(
    card_id: str,
    user: AuthDep,
    conn: DbDep,
) -> list[CommentResponse]:
    await set_user(conn, str(user.id))
    if not await _card_visible(conn, card_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Card not found."
        )
    rows = await conn.fetch(
        f"SELECT {Cols} FROM comments WHERE card_id = $1 ORDER BY created_at",
        card_id,
    )
    return [CommentResponse.model_validate(_stringify(dict(r))) for r in rows]


@router.post(
    "/cards/{card_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["comments"],
)
async def create_comment(
    card_id: str,
    body: CreateCommentRequest,
    user: AuthDep,
    conn: DbDep,
) -> CommentResponse:
    await set_user(conn, str(user.id))
    if not await _card_visible(conn, card_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Card not found."
        )
    try:
        row = await conn.fetchrow(
            f"INSERT INTO comments (card_id, author_id, body) "
            f"VALUES ($1, $2, $3) "
            f"RETURNING {Cols}",
            card_id,
            str(user.id),
            body.body,
        )
    except asyncpg.InsufficientPrivilegeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace.",
        ) from exc
    except asyncpg.PostgresError as exc:
        log.warning("create_comment failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Comment not created."
        )
    return CommentResponse.model_validate(_stringify(dict(row)))


@router.delete(
    "/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["comments"]
)
async def delete_comment(
    comment_id: str,
    user: AuthDep,
    conn: DbDep,
):
    await set_user(conn, str(user.id))
    row = await conn.fetchrow(
        f"SELECT id FROM comments WHERE id = $1", comment_id
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found."
        )
    try:
        result = await conn.execute("DELETE FROM comments WHERE id = $1", comment_id)
    except asyncpg.InsufficientPrivilegeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author or a workspace admin may delete this comment.",
        ) from exc
    # RLS lets the statement succeed but match zero rows for a non-author.
    if result is None or result.endswith("DELETE 0"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author or a workspace admin may delete this comment.",
        )


__all__ = ["router"]