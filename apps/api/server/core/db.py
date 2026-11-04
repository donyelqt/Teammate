"""Pooled asyncpg access.

Connects as the Postgres superuser and steps into the `authenticated` role
per request, so Supabase RLS policies (which key off `auth.uid()` →
`request.jwt.claim.sub`) actually gate every query. A direct `authenticated`
connection is impossible: that role is not login-capable, and connecting as
`postgres` bypasses RLS entirely.

The role and claim are reset when the connection returns to the pool, so a
pooled connection never leaks the previous request's principal into the next.
"""

from __future__ import annotations

import asyncpg
from fastapi import Depends

from .config import get_settings

_pool: asyncpg.Pool | None = None


async def get_db_pool() -> asyncpg.Pool:
    """Return the process-wide connection pool, creating it on first call."""
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=1,
            max_size=10,
        )
    return _pool


async def get_db() -> asyncpg.Connection:
    """Yield a single connection for the duration of one request.

    The connection is reset to its login state on the way out, so a pooled
    connection never carries the previous request's role or claim.
    """
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        try:
            yield conn
        finally:
            await conn.execute("RESET ROLE")
            await conn.execute(
                "SELECT set_config('request.jwt.claim.sub', NULL, true)"
            )


async def close_db_pool() -> None:
    """Tear down the pool. Registered on app shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def set_user(conn: asyncpg.Connection, user_id: str) -> None:
    """Put the connection into the authenticated role with the user's claim.

    Must run before any RLS-gated query. `set_config` accepts a parameterised
    value; `SET request.jwt.claim.sub = $1` does not.
    """
    await conn.execute("SET ROLE authenticated")
    await conn.execute(
        "SELECT set_config('request.jwt.claim.sub', $1, true)", user_id
    )


__all__ = ["get_db", "get_db_pool", "close_db_pool", "set_user"]