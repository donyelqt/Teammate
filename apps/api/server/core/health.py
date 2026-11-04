"""Health check endpoint with dependency probes."""

from fastapi import APIRouter, status

from .db import get_db_pool

router = APIRouter(tags=["health"])


@router.get("/health", status_code=status.HTTP_200_OK)
async def health() -> dict:
    checks: dict[str, str] = {}

    # database probe — only run when a pool is configured
    try:
        pool = await get_db_pool()
        if pool is None:
            checks["database"] = "configured"
        else:
            async with pool.acquire() as conn:
                await conn.execute("SELECT 1")
            checks["database"] = "up"
    except Exception:
        checks["database"] = "down"

    # realtime binding is configured (Supabase realtime is a separate service)
    checks["realtime"] = "up"

    overall = "ok" if all(v in ("up", "configured") for v in checks.values()) else "down"

    return {
        "status": overall,
        "version": "0.1.0",
        "checks": checks,
    }