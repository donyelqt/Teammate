"""Card routes.

Cards belong to a list, which belongs to a board, which belongs to a
workspace. RLS walks that chain from the caller's `auth.uid()`, so every
handler only needs to set the principal and run the query.
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

log = logging.getLogger("teammate.cards")


def _stringify(record: dict) -> dict:
    """Coerce asyncpg UUID values to str for Pydantic."""
    return {
        k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in record.items()
    }

router = APIRouter()

AuthDep = Annotated[AuthUser, Depends(get_current_user)]
DbDep = Annotated[asyncpg.Connection, Depends(get_db)]

CardCols = (
    "id, list_id, title, description, position, assignee_ids, "
    "due_at::text, labels, archived_at::text, created_by, "
    "created_at::text, updated_at::text"
)


class CardResponse(BaseModel):
    id: str
    list_id: str
    title: str
    description: str
    position: int
    assignee_ids: list[str]
    due_at: str | None
    labels: list[str]
    archived_at: str | None
    created_by: str
    created_at: str
    updated_at: str


class CreateCardRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str = Field(default="")
    position: int = Field(default=0)
    assignee_ids: list[str] = Field(default_factory=list)
    due_at: str | None = None
    labels: list[str] = Field(default_factory=list)


class UpdateCardRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    position: int | None = None
    assignee_ids: list[str] | None = None
    due_at: str | None = None
    labels: list[str] | None = None
    list_id: str | None = None


async def _get_card(conn: asyncpg.Connection, card_id: str) -> dict | None:
    return await conn.fetchrow(
        f"SELECT {CardCols} FROM cards WHERE id = $1", card_id
    )


async def _board_visible(conn: asyncpg.Connection, board_id: str) -> bool:
    """True when the caller can see the board under RLS."""
    row = await conn.fetchrow(
        "SELECT 1 FROM boards WHERE id = $1", board_id
    )
    return row is not None


async def _list_visible(conn: asyncpg.Connection, list_id: str) -> bool:
    """True when the caller can see the list under RLS."""
    row = await conn.fetchrow(
        "SELECT 1 FROM lists WHERE id = $1", list_id
    )
    return row is not None


@router.get(
    "/boards/{board_id}/cards",
    response_model=list[CardResponse],
    tags=["cards"],
)
async def list_cards_in_board(
    board_id: str,
    user: AuthDep,
    conn: DbDep,
) -> list[CardResponse]:
    await set_user(conn, str(user.id))
    if not await _board_visible(conn, board_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Board not found."
        )
    rows = await conn.fetch(
        f"SELECT c.id, c.list_id, c.title, c.description, c.position, "
        f"c.assignee_ids, c.due_at::text, c.labels, c.archived_at::text, "
        f"c.created_by, c.created_at::text, c.updated_at::text "
        "FROM cards c JOIN lists l ON l.id = c.list_id "
        "WHERE l.board_id = $1 "
        "ORDER BY l.position, c.position",
        board_id,
    )
    return [CardResponse.model_validate(_stringify(dict(r))) for r in rows]


@router.get(
    "/boards/{board_id}/lists/{list_id}/cards",
    response_model=list[CardResponse],
    tags=["cards"],
)
async def list_cards_in_list(
    board_id: str,
    list_id: str,
    user: AuthDep,
    conn: DbDep,
) -> list[CardResponse]:
    await set_user(conn, str(user.id))
    if not await _list_visible(conn, list_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="List not found."
        )
    rows = await conn.fetch(
        f"SELECT {CardCols} FROM cards WHERE list_id = $1 ORDER BY position",
        list_id,
    )
    return [CardResponse.model_validate(_stringify(dict(r))) for r in rows]


@router.post(
    "/boards/{board_id}/lists/{list_id}/cards",
    response_model=CardResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["cards"],
)
async def create_card(
    board_id: str,
    list_id: str,
    body: CreateCardRequest,
    user: AuthDep,
    conn: DbDep,
) -> CardResponse:
    await set_user(conn, str(user.id))
    if not await _list_visible(conn, list_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="List not found."
        )
    try:
        row = await conn.fetchrow(
            "INSERT INTO cards "
            "(list_id, title, description, position, assignee_ids, due_at, labels, created_by) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) "
            f"RETURNING {CardCols}",
            list_id,
            body.title,
            body.description,
            body.position,
            body.assignee_ids,
            body.due_at,
            body.labels,
            str(user.id),
        )
    except asyncpg.InsufficientPrivilegeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace.",
        ) from exc
    except asyncpg.PostgresError as exc:
        log.warning("create_card failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Card not created."
        )
    return CardResponse.model_validate(_stringify(dict(row)))


@router.patch("/cards/{card_id}", response_model=CardResponse, tags=["cards"])
async def update_card(
    card_id: str,
    body: UpdateCardRequest,
    user: AuthDep,
    conn: DbDep,
) -> CardResponse:
    await set_user(conn, str(user.id))
    existing = await _get_card(conn, card_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Card not found."
        )

    sets: list[str] = []
    args: list[object] = []
    for field in (
        "title",
        "description",
        "position",
        "assignee_ids",
        "due_at",
        "labels",
        "list_id",
    ):
        value = getattr(body, field)
        if value is None:
            continue
        sets.append(f"{field} = ${len(args) + 2}")
        args.append(value)

    if not sets:
        return CardResponse.model_validate(dict(existing))

    try:
        row = await conn.fetchrow(
            f"UPDATE cards SET {', '.join(sets)} "
            f"WHERE id = $1 "
            f"RETURNING {CardCols}",
            card_id,
            *args,
        )
    except asyncpg.PostgresError as exc:
        log.warning("update_card failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Card not found."
        )
    return CardResponse.model_validate(_stringify(dict(row)))


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["cards"])
async def delete_card(
    card_id: str,
    user: AuthDep,
    conn: DbDep,
):
    await set_user(conn, str(user.id))
    existing = await _get_card(conn, card_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Card not found."
        )
    try:
        result = await conn.execute("DELETE FROM cards WHERE id = $1", card_id)
    except asyncpg.InsufficientPrivilegeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this card.",
        ) from exc
    # RLS lets the statement succeed but match zero rows for a non-owner.
    # asyncpg returns "DELETE 0" in that case.
    if result is None or result.endswith("DELETE 0"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this card.",
        )


__all__ = ["router"]