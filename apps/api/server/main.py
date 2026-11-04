"""FastAPI application entrypoint.

Routers are mounted under `/api/v1`. The database pool is opened lazily on
first request and closed on shutdown.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from .core.db import close_db_pool
from .core.health import router as health_router
from .core.logging import RequestIDMiddleware, setup_logging
from .routers import activity, boards, cards, comments


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    yield
    await close_db_pool()


app = FastAPI(
    title="Teammate API",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(boards.router, prefix="/api/v1", tags=["boards"])
app.include_router(cards.router, prefix="/api/v1", tags=["cards"])
app.include_router(comments.router, prefix="/api/v1", tags=["comments"])
app.include_router(activity.router, prefix="/api/v1", tags=["activity"])
app.include_router(health_router)

app.add_middleware(RequestIDMiddleware)