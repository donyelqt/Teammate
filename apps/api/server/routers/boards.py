"""Board routes.

Membership and role checks are enforced by Postgres RLS, not by Python. Every
handler sets the request principal on the connection first, then runs a query
that would return zero rows (or raise `InsufficientPrivilegeError`) for a
non-member. The HTTP layer maps that to 404 / 403.
"""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..core.auth import AuthUser, get_current_user
from ..core.db import get_db, set_user

log = logging.getLogger("teammate.boards")


def _stringify(record: dict) -> dict:
    """Coerce asyncpg UUID values to str for Pydantic."""
    return {
        k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in record.items()
    }

router = APIRouter()

AuthDep = Annotated[AuthUser, Depends(get_current_user)]
DbDep = Annotated[asyncpg.Connection, Depends(get_db)]

Cols = (
    "id, workspace_id, name, position, created_by, "
    "created_at::text, updated_at::text"
)


class BoardResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    position: int
    created_by: str
    created_at: str
    updated_at: str


class CreateBoardRequest(BaseModel):
    workspace_id: str = Field(..., description="Workspace the board is created in.")
    name: str = Field(..., min_length=1, max_length=120)


async def _get_board(conn: asyncpg.Connection, board_id: str) -> dict | None:
    return await conn.fetchrow(
        f"SELECT {Cols} FROM boards WHERE id = $1", board_id
    )


@router.get("/boards", response_model=list[BoardResponse], tags=["boards"])
async def list_boards(
    user: AuthDep,
    conn: DbDep,
) -> list[BoardResponse]:
    await set_user(conn, str(user.id))
    rows = await conn.fetch(
        f"SELECT {Cols} FROM boards ORDER BY workspace_id, position"
    )
    return [BoardResponse.model_validate(_stringify(dict(r))) for r in rows]


@router.get("/boards/{board_id}", response_model=BoardResponse, tags=["boards"])
async def get_board(
    board_id: str,
    user: AuthDep,
    conn: DbDep,
) -> BoardResponse:
    await set_user(conn, str(user.id))
    row = await _get_board(conn, board_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Board not found."
        )
    return BoardResponse.model_validate(_stringify(dict(row)))


@router.post(
    "/boards",
    response_model=BoardResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["boards"],
)
async def create_board(
    body: CreateBoardRequest,
    user: AuthDep,
    conn: DbDep,
) -> BoardResponse:
    await set_user(conn, str(user.id))
    try:
        row = await conn.fetchrow(
            "INSERT INTO boards (workspace_id, name, created_by) "
            "VALUES ($1, $2, $3) "
            f"RETURNING {Cols}",
            body.workspace_id,
            body.name,
            str(user.id),
        )
    except asyncpg.InsufficientPrivilegeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace.",
        ) from exc
    except asyncpg.PostgresError as exc:
        log.warning("create_board failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Board not created."
        )
    return BoardResponse.model_validate(_stringify(dict(row)))


@router.delete(
    "/boards/{board_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["boards"],
)
async def delete_board(
    board_id: str,
    user: AuthDep,
    conn: DbDep,
):
    await set_user(conn, str(user.id))
    row = await _get_board(conn, board_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Board not found."
        )
    try:
        result = await conn.execute("DELETE FROM boards WHERE id = $1", board_id)
    except asyncpg.InsufficientPrivilegeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners and admins may delete boards.",
        ) from exc
    # RLS lets the statement succeed but match zero rows for a non-owner.
    if result is None or result.endswith("DELETE 0"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners and admins may delete boards.",
        )


__all__ = ["router"]
