"""Pytest fixtures for the FastAPI router suite.

Fixtures are seeded into the live Supabase Postgres container (port 54322),
which is already migrated and RLS-enabled. Each test runs against a
transaction that is rolled back at the end, so the suite never mutates the
database and tests stay independent.

The connection model mirrors production: connect as the Postgres superuser,
step into the `authenticated` role, and set `request.jwt.claim.sub` to the
principal. That is what Supabase RLS keys off, and it is the only way to
exercise the policies for real — the `authenticated` role is not
login-capable, and connecting as `postgres` bypasses RLS entirely.

The app's `get_db` dependency is overridden to hand out the fixture's
connection, so writes made through the app land in the same transaction the
fixture seeded.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator

import asyncpg
import httpx
import jwt
import pytest
import pytest_asyncio

from server.core.db import get_db
from server.main import app

JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long"
DB_URL = os.environ.get(
    "TEAMMATE_DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
)

# ---------------------------------------------------------------------------
# Principals — real users in the seeded database.
# ---------------------------------------------------------------------------
OWNER = uuid.UUID("531eadaa-47b5-4b1e-9d77-30568165b879")
MEMBER = uuid.UUID("07299273-9c7c-48ce-9455-d05507f48a8c")
OUTSIDER = uuid.UUID("33333333-3333-3333-3333-333333333333")

# Workspace `fa2943df...` is owned by OWNER and has MEMBER as a member.
WORKSPACE_ID = uuid.UUID("fa2943df-e8bb-4d60-b8e2-dd6df6e03931")
BOARD_ID = uuid.UUID("d7462dfb-36b2-4cbe-a3ae-20899121575c")


def make_token(user_id: uuid.UUID) -> str:
    return jwt.encode(
        {"sub": str(user_id), "role": "authenticated", "exp": 2**31},
        JWT_SECRET,
        algorithm="HS256",
    )


def auth_header(user_id: uuid.UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(user_id)}"}


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def db_pool() -> AsyncIterator[asyncpg.Pool]:
    pool = await asyncpg.create_pool(DB_URL, min_size=1, max_size=5)
    try:
        yield pool
    finally:
        await pool.close()


@pytest_asyncio.fixture
async def db_conn(db_pool: asyncpg.Pool) -> AsyncIterator[asyncpg.Connection]:
    async with db_pool.acquire() as conn:
        await conn.execute("BEGIN")
        try:
            yield conn
        finally:
            await conn.execute("ROLLBACK")


@pytest_asyncio.fixture
async def client(db_conn: asyncpg.Connection) -> AsyncIterator[httpx.AsyncClient]:
    """An async test client whose requests share the fixture's transaction."""
    async def _override_get_db() -> AsyncIterator[asyncpg.Connection]:
        yield db_conn

    app.dependency_overrides[get_db] = _override_get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Seeded data
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def seeded(db_conn: asyncpg.Connection) -> dict[str, str]:
    """A board owned by OWNER, with one list, one card, and one comment."""
    await db_conn.execute("SET ROLE authenticated")
    await db_conn.execute(
        "SELECT set_config('request.jwt.claim.sub', $1, true)", str(OWNER)
    )

    list_id = uuid.uuid4()
    card_id = uuid.uuid4()
    comment_id = uuid.uuid4()

    await db_conn.execute(
        "INSERT INTO lists (id, board_id, name) VALUES ($1, $2, $3)",
        list_id, BOARD_ID, "Backlog",
    )
    await db_conn.execute(
        "INSERT INTO cards (id, list_id, title, created_by) VALUES ($1, $2, $3, $4)",
        card_id, list_id, "Wire the board shell", str(OWNER),
    )
    await db_conn.execute(
        "INSERT INTO comments (id, card_id, author_id, body) VALUES ($1, $2, $3, $4)",
        comment_id, card_id, str(OWNER), "Looks good.",
    )

    return {
        "workspace_id": str(WORKSPACE_ID),
        "board_id": str(BOARD_ID),
        "list_id": str(list_id),
        "card_id": str(card_id),
        "comment_id": str(comment_id),
    }


__all__ = [
    "OWNER",
    "MEMBER",
    "OUTSIDER",
    "WORKSPACE_ID",
    "BOARD_ID",
    "make_token",
    "auth_header",
    "client",
    "db_conn",
    "db_pool",
    "seeded",
]