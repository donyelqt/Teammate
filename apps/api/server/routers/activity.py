"""Board activity feed.

The last 50 events for a board. Row-level security on `activity_events` keys
off `workspace_id`, so a non-member's query returns an empty list rather than
an error — the route still needs the caller authenticated to reach the
endpoint at all.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.auth import AuthUser, get_current_user
from ..core.db import get_db, set_user

log = logging.getLogger("teammate.activity")

router = APIRouter()

AuthDep = Annotated[AuthUser, Depends(get_current_user)]
DbDep = Annotated[asyncpg.Connection, Depends(get_db)]

Cols = (
    "id, workspace_id, board_id, card_id, actor_id, kind, "
    "payload::text, created_at::text"
)


class ActivityEventResponse(BaseModel):
    id: int
    workspace_id: str
    board_id: str | None
    card_id: str | None
    actor_id: str
    kind: str
    payload: dict
    created_at: str


@router.get(
    "/boards/{board_id}/activity",
    response_model=list[ActivityEventResponse],
    tags=["activity"],
)
async def list_activity(
    board_id: str,
    user: AuthDep,
    conn: DbDep,
) -> list[ActivityEventResponse]:
    await set_user(conn, str(user.id))
    rows = await conn.fetch(
        f"SELECT {Cols} FROM activity_events "
        "WHERE board_id = $1 "
        "ORDER BY id DESC "
        "LIMIT 50",
        board_id,
    )
    out: list[ActivityEventResponse] = []
    for r in rows:
        payload = r["payload"]
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                payload = {}
        out.append(
            ActivityEventResponse.model_validate(
                {
                    "id": str(r["id"]),
                    "workspace_id": str(r["workspace_id"]),
                    "board_id": (str(r["board_id"]) if r["board_id"] is not None else None),
                    "card_id": (str(r["card_id"]) if r["card_id"] is not None else None),
                    "actor_id": str(r["actor_id"]),
                    "kind": r["kind"],
                    "payload": payload,
                    "created_at": r["created_at"],
                }
            )
        )
    return out


__all__ = ["router"]